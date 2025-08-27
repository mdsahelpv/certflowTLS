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
    return {};
  }
  const data = fs.readFileSync(configFile, 'utf-8');
  return JSON.parse(data);
}


program
  .version('1.0.0')
  .description('A CLI for interacting with the Certificate Authority Management System');

program
  .command('status')
  .description('Check the status of the CA server')
  .option('-s, --server <url>', 'URL of the CA server', 'http://localhost:3000')
  .action(async (options) => {
    try {
      const response = await axios.get(`${options.server}/api/health`);
      if (response.status === 200 && response.data.status === 'ok') {
        console.log(`✅ Server is up and running at ${options.server}`);
        console.log(`   - Status: ${response.data.status}`);
        console.log(`   - Timestamp: ${response.data.timestamp}`);
      } else {
        console.error(`❌ Server at ${options.server} responded with status ${response.status}`);
      }
    } catch (error: any) {
      console.error(`❌ Failed to connect to the server at ${options.server}`);
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
  .requiredOption('-s, --server <url>', 'URL of the CA server')
  .requiredOption('-u, --username <username>', 'Username for authentication')
  .requiredOption('-p, --password <password>', 'Password for authentication')
  .action(async (options) => {
    try {
      const response = await axios.post(`${options.server}/api/auth/token`, {
        username: options.username,
        password: options.password,
      });

      if (response.status === 200 && response.data.token) {
        const config = {
          server: options.server,
          token: response.data.token,
        };
        saveConfig(config);
        console.log(`✅ Successfully logged in to ${options.server}`);
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

const certCommand = program.command('cert').description('Manage certificates');

certCommand
  .command('issue')
  .description('Issue a new certificate')
  .requiredOption('--cn <commonName>', 'Common Name for the certificate subject')
  .option('--type <type>', 'Type of certificate (SERVER, CLIENT, CA)', 'SERVER')
  .option('--days <days>', 'Validity period in days', '365')
  .option('--sans <sans>', 'Subject Alternative Names, comma-separated')
  .action(async (options) => {
    const config = loadConfig();
    if (!config.token || !config.server) {
      console.error('❌ You are not logged in. Please run `login` first.');
      return;
    }

    try {
      const subjectDN = `CN=${options.cn}`;
      const sans = options.sans ? options.sans.split(',') : [];

      const response = await axios.post(
        `${config.server}/api/certificates/issue`,
        {
          subjectDN,
          certificateType: options.type,
          validityDays: parseInt(options.days, 10),
          sans,
          keyAlgorithm: 'RSA', // Defaulting for simplicity
          keySize: 2048,
        },
        {
          headers: {
            Authorization: `Bearer ${config.token}`,
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

program.parse(process.argv);
