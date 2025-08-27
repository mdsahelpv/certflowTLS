#!/usr/bin/env node

import { Command } from 'commander';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const program = new Command();

const configDir = path.join(os.homedir(), '.my-ca-cli');
const configFile = path.join(configDir, 'config.json');

function saveConfig(data: any) {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(configFile, JSON.stringify(data, null, 2));
}

function loadConfig() {
  if (!fs.existsSync(configFile)) {
    return {} as { server?: string; token?: string };
  }
  const data = fs.readFileSync(configFile, 'utf-8');
  return JSON.parse(data);
}

async function getApiConfig(options: any) {
  const config = loadConfig();
  const server = options.server || config.server || 'http://localhost:3000';
  const token = options.token || config.token;
  return { server, token };
}

program
  .version('1.0.0')
  .description('A CLI for interacting with the Certificate Authority Management System')
  .option('-s, --server <url>', 'URL of the CA server')
  .option('--token <token>', 'Bearer token for authentication');

program
  .command('status')
  .description('Check the status of the CA server')
  .action(async (options) => {
    const { server } = await getApiConfig(program.opts());
    try {
      const response = await axios.get(`${server}/api/health`);
      if (response.status === 200 && response.data.status === 'ok') {
        console.log(`✅ Server is up and running at ${server}`);
        console.log(`   - Status: ${response.data.status}`);
        console.log(`   - Timestamp: ${response.data.timestamp}`);
      } else {
        console.error(`❌ Server at ${server} responded with status ${response.status}`);
      }
    } catch (error: any) {
      console.error(`❌ Failed to connect to the server at ${server}`);
      if (error.response) {
        console.error(`   - Status: ${error.response.status}`);
        console.error(`   - Data: ${JSON.stringify(error.response.data)}`);
      } else {
        console.error(`   - Error: ${error.message}`);
      }
    }
  });

program
  .command('login')
  .description('Authenticate with the CA server')
  .requiredOption('-u, --username <username>', 'Username for authentication')
  .requiredOption('-p, --password <password>', 'Password for authentication')
  .action(async (options) => {
    const { server } = await getApiConfig(program.opts());
    try {
      const response = await axios.post(`${server}/api/auth/token`, {
        username: options.username,
        password: options.password,
      });

      if (response.status === 200 && response.data.token) {
        console.warn('⚠️  Warning: Authentication token is stored in plain text in the configuration file.');
        const config = {
          server: server,
          token: response.data.token,
        };
        saveConfig(config);
        console.log(`✅ Successfully logged in to ${server}`);
      } else {
        console.error(`❌ Authentication failed. Server responded with status ${response.status}`);
      }
    } catch (error: any) {
      console.error('❌ Authentication failed.');
      if (error.response) {
        console.error(`   - Status: ${error.response.status}`);
        console.error(`   - Error: ${error.response.data?.error || 'Unknown error'}`);
      } else {
        console.error(`   - Error: ${error.message}`);
      }
    }
  });

program
  .command('logout')
  .description('Log out and clear the stored configuration')
  .action(() => {
    if (fs.existsSync(configFile)) {
      fs.unlinkSync(configFile);
      console.log('✅ Successfully logged out and cleared configuration.');
    } else {
      console.log('🤔 No configuration file to clear.');
    }
  });

const configCommand = program.command('config').description('Manage CLI configuration');

configCommand
  .command('get')
  .description('Get the current configuration')
  .action(() => {
    const config = loadConfig();
    console.log(JSON.stringify(config, null, 2));
  });

configCommand
  .command('set')
  .description('Set a configuration key-value pair')
  .argument('<key>', 'The configuration key to set')
  .argument('<value>', 'The value to set for the key')
  .action((key, value) => {
    const config = loadConfig();
    (config as any)[key] = value;
    saveConfig(config);
    console.log(`✅ Configuration updated: ${key} = ${value}`);
  });

const certCommand = program.command('cert').description('Manage certificates');

certCommand
  .command('issue')
  .description('Issue a new certificate')
  .requiredOption('--cn <commonName>', 'Common Name for the certificate subject')
  .option('--type <type>', 'Type of certificate (SERVER, CLIENT, CA)', 'SERVER')
  .option('--days <days>', 'Validity period in days', '365')
  .option('--sans <sans>', 'Subject Alternative Names, comma-separated')
  .option('--keyAlgorithm <algorithm>', 'Key algorithm (RSA or ECDSA)', 'RSA')
  .option('--keySize <size>', 'Key size (e.g., 2048 for RSA, 256 for ECDSA)', '2048')
  .action(async (options) => {
    const { server, token } = await getApiConfig(program.opts());
    if (!token) {
      console.error('❌ You are not logged in. Please run `login` first or provide a --token.');
      return;
    }

    try {
      const subjectDN = `CN=${options.cn}`;
      const sans = options.sans ? options.sans.split(',') : [];

      const response = await axios.post(
        `${server}/api/certificates/issue`,
        {
          subjectDN,
          certificateType: options.type,
          validityDays: parseInt(options.days, 10),
          sans,
          keyAlgorithm: options.keyAlgorithm,
          keySize: parseInt(options.keySize, 10),
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status === 200 && response.data.certificate) {
        console.log('✅ Certificate issued successfully:');
        console.log(response.data.certificate);
        if (response.data.privateKey) {
          console.log('\n🔑 Private Key:');
          console.log(response.data.privateKey);
        }
      } else {
        console.error(`❌ Certificate issuance failed. Server responded with status ${response.status}`);
      }
    } catch (error: any) {
      console.error('❌ Certificate issuance failed.');
      if (error.response) {
        console.error(`   - Status: ${error.response.status}`);
        console.error(`   - Error: ${error.response.data?.error || 'Unknown error'}`);
      } else {
        console.error(`   - Error: ${error.message}`);
      }
    }
  });

certCommand
  .command('list')
  .description('List certificates')
  .option('--limit <limit>', 'Number of results to return', '20')
  .option('--page <page>', 'Page number', '1')
  .option('--type <type>', 'Filter by certificate type (SERVER, CLIENT, CA)')
  .option('--status <status>', 'Filter by status (ACTIVE, REVOKED, EXPIRED)')
  .option('--subjectDN <subjectDN>', 'Filter by subject DN')
  .action(async (options) => {
    const { server, token } = await getApiConfig(program.opts());
    if (!token) {
      console.error('❌ You are not logged in. Please run `login` first or provide a --token.');
      return;
    }

    try {
      const params = new URLSearchParams();
      if (options.limit) params.append('limit', options.limit);
      if (options.page) params.append('page', options.page);
      if (options.type) params.append('type', options.type);
      if (options.status) params.append('status', options.status);
      if (options.subjectDN) params.append('subjectDN', options.subjectDN);

      const response = await axios.get(`${server}/api/certificates`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 200) {
        console.log('✅ Certificates retrieved successfully:');
        console.log(JSON.stringify(response.data, null, 2));
      } else {
        console.error(`❌ Failed to list certificates. Server responded with status ${response.status}`);
      }
    } catch (error: any) {
      console.error('❌ Failed to list certificates.');
      if (error.response) {
        console.error(`   - Status: ${error.response.status}`);
        console.error(`   - Error: ${error.response.data?.error || 'Unknown error'}`);
      } else {
        console.error(`   - Error: ${error.message}`);
      }
    }
  });

certCommand
  .command('revoke')
  .description('Revoke a certificate')
  .requiredOption('--serialNumber <serial>', 'Serial number of the certificate to revoke')
  .option('--reason <reason>', 'Revocation reason', 'UNSPECIFIED')
  .action(async (options) => {
    const { server, token } = await getApiConfig(program.opts());
    if (!token) {
      console.error('❌ You are not logged in. Please run `login` first or provide a --token.');
      return;
    }

    try {
      const response = await axios.post(
        `${server}/api/certificates/revoke`,
        {
          serialNumber: options.serialNumber,
          reason: options.reason,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.status === 200) {
        console.log('✅ Certificate revoked successfully.');
      } else {
        console.error(`❌ Certificate revocation failed. Server responded with status ${response.status}`);
      }
    } catch (error: any) {
      console.error('❌ Certificate revocation failed.');
      if (error.response) {
        console.error(`   - Status: ${error.response.status}`);
        console.error(`   - Error: ${error.response.data?.error || 'Unknown error'}`);
      } else {
        console.error(`   - Error: ${error.message}`);
      }
    }
  });

certCommand
  .command('renew')
  .description('Renew a certificate')
  .requiredOption('--serialNumber <serial>', 'Serial number of the certificate to renew')
  .action(async (options) => {
    const { server, token } = await getApiConfig(program.opts());
    if (!token) {
      console.error('❌ You are not logged in. Please run `login` first or provide a --token.');
      return;
    }

    try {
      const response = await axios.post(
        `${server}/api/certificates/${options.serialNumber}/renew`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.status === 200) {
        console.log('✅ Certificate renewed successfully:');
        console.log(JSON.stringify(response.data, null, 2));
      } else {
        console.error(`❌ Certificate renewal failed. Server responded with status ${response.status}`);
      }
    } catch (error: any) {
      console.error('❌ Certificate renewal failed.');
      if (error.response) {
        console.error(`   - Status: ${error.response.status}`);
        console.error(`   - Error: ${error.response.data?.error || 'Unknown error'}`);
      } else {
        console.error(`   - Error: ${error.message}`);
      }
    }
  });

const caCommand = program.command('ca').description('Manage Certificate Authorities');

caCommand
  .command('list')
  .description('List all CAs')
  .action(async () => {
    const { server, token } = await getApiConfig(program.opts());
    if (!token) {
      console.error('❌ You are not logged in. Please run `login` first or provide a --token.');
      return;
    }

    try {
      const response = await axios.get(`${server}/api/ca/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 200) {
        console.log('✅ CA statuses retrieved successfully:');
        console.log(JSON.stringify(response.data, null, 2));
      } else {
        console.error(`❌ Failed to list CAs. Server responded with status ${response.status}`);
      }
    } catch (error: any) {
      console.error('❌ Failed to list CAs.');
      if (error.response) {
        console.error(`   - Status: ${error.response.status}`);
        console.error(`   - Error: ${error.response.data?.error || 'Unknown error'}`);
      } else {
        console.error(`   - Error: ${error.message}`);
      }
    }
  });

caCommand
  .command('get')
  .description('Get details for a specific CA')
  .requiredOption('--id <id>', 'ID of the CA to retrieve')
  .action(async (options) => {
    const { server, token } = await getApiConfig(program.opts());
    if (!token) {
      console.error('❌ You are not logged in. Please run `login` first or provide a --token.');
      return;
    }

    try {
      const response = await axios.get(`${server}/api/ca/${options.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 200) {
        console.log('✅ CA details retrieved successfully:');
        console.log(JSON.stringify(response.data, null, 2));
      } else {
        console.error(`❌ Failed to get CA details. Server responded with status ${response.status}`);
      }
    } catch (error: any) {
      console.error('❌ Failed to get CA details.');
      if (error.response) {
        console.error(`   - Status: ${error.response.status}`);
        console.error(`   - Error: ${error.response.data?.error || 'Unknown error'}`);
      } else {
        console.error(`   - Error: ${error.message}`);
      }
    }
  });

caCommand
  .command('delete')
  .description('Delete a CA')
  .requiredOption('--id <id>', 'ID of the CA to delete')
  .action(async (options) => {
    const { server, token } = await getApiConfig(program.opts());
    if (!token) {
      console.error('❌ You are not logged in. Please run `login` first or provide a --token.');
      return;
    }

    try {
      const response = await axios.delete(`${server}/api/ca/${options.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 200) {
        console.log('✅ CA deleted successfully.');
      } else {
        console.error(`❌ Failed to delete CA. Server responded with status ${response.status}`);
      }
    } catch (error: any) {
      console.error('❌ Failed to delete CA.');
      if (error.response) {
        console.error(`   - Status: ${error.response.status}`);
        console.error(`   - Error: ${error.response.data?.error || 'Unknown error'}`);
      } else {
        console.error(`   - Error: ${error.message}`);
      }
    }
  });

const crlCommand = program.command('crl').description('Manage Certificate Revocation Lists');

crlCommand
  .command('generate')
  .description('Generate a new CRL')
  .option('--type <type>', 'Type of CRL (full or delta)', 'full')
  .option('--caId <caId>', 'ID of the CA to generate the CRL for')
  .action(async (options) => {
    const { server, token } = await getApiConfig(program.opts());
    if (!token) {
      console.error('❌ You are not logged in. Please run `login` first or provide a --token.');
      return;
    }

    try {
      const response = await axios.post(
        `${server}/api/crl/generate`,
        {
          type: options.type,
          caId: options.caId,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.status === 200) {
        console.log('✅ CRL generated successfully:');
        console.log(response.data);
      } else {
        console.error(`❌ Failed to generate CRL. Server responded with status ${response.status}`);
      }
    } catch (error: any) {
      console.error('❌ Failed to generate CRL.');
      if (error.response) {
        console.error(`   - Status: ${error.response.status}`);
        console.error(`   - Error: ${error.response.data?.error || 'Unknown error'}`);
      } else {
        console.error(`   - Error: ${error.message}`);
      }
    }
  });

crlCommand
  .command('download')
  .description('Download the latest CRL')
  .option('--out <file>', 'Output file to save the CRL')
  .action(async (options) => {
    const { server, token } = await getApiConfig(program.opts());
    if (!token) {
      console.error('❌ You are not logged in. Please run `login` first or provide a --token.');
      return;
    }

    try {
      const response = await axios.get(`${server}/api/crl/download/latest`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 200) {
        if (options.out) {
          fs.writeFileSync(options.out, response.data);
          console.log(`✅ CRL downloaded successfully and saved to ${options.out}`);
        } else {
          console.log(response.data);
        }
      } else {
        console.error(`❌ Failed to download CRL. Server responded with status ${response.status}`);
      }
    } catch (error: any) {
      console.error('❌ Failed to download CRL.');
      if (error.response) {
        console.error(`   - Status: ${error.response.status}`);
        console.error(`   - Error: ${error.response.data?.error || 'Unknown error'}`);
      } else {
        console.error(`   - Error: ${error.message}`);
      }
    }
  });

program.parse(process.argv);
