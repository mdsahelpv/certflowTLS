import crypto from 'crypto';
import forge from 'node-forge';

export interface ExportOptions {
  format: 'PEM' | 'DER' | 'PKCS12';
  includePrivateKey?: boolean;
  password?: string; // For PKCS12
}

export class CertificateExporter {
  private static toArrayBuffer(input: Buffer): ArrayBuffer {
    const arrayBuffer = new ArrayBuffer(input.byteLength);
    const view = new Uint8Array(arrayBuffer);
    view.set(new Uint8Array(input.buffer, input.byteOffset, input.byteLength));
    return arrayBuffer;
  }
  static async exportCertificate(
    certificate: string,
    privateKey?: string,
    options: ExportOptions = { format: 'PEM' }
  ): Promise<Blob> {
    switch (options.format) {
      case 'PEM':
        return this.exportToPEM(certificate, privateKey);
      case 'DER':
        return this.exportToDER(certificate);
      case 'PKCS12':
        return this.exportToPKCS12(certificate, privateKey, options.password);
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  private static exportToPEM(certificate: string, privateKey?: string): Blob {
    const content = privateKey ? 
      `${certificate}\n${privateKey}` : 
      certificate;
    
    return new Blob([content], { type: 'application/x-pem-file' });
  }

  private static exportToDER(certificate: string): Blob {
    // Convert PEM to DER
    const derContent = this.pemToDer(certificate);
    const arrayBuffer = this.toArrayBuffer(derContent);
    return new Blob([arrayBuffer], { type: 'application/x-x509-ca-cert' });
  }

  private static exportToPKCS12(
    certificate: string, 
    privateKey?: string, 
    password?: string
  ): Blob {
    if (!privateKey) {
      throw new Error('Private key is required for PKCS12 export');
    }

    const p12Der = this.generatePKCS12(certificate, privateKey, password);
    const arrayBuffer = this.toArrayBuffer(p12Der);
    return new Blob([arrayBuffer], { type: 'application/x-pkcs12' });
  }

  private static pemToDer(pem: string): Buffer {
    // Remove PEM header and footer
    const base64 = pem
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s/g, '');
    
    return Buffer.from(base64, 'base64');
  }

  private static generatePKCS12(
    certificatePem: string,
    privateKeyPem: string,
    password?: string
  ): Buffer {
    // Parse PEMs
    const cert = forge.pki.certificateFromPem(certificatePem);
    const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
    const newPkcs12Asn1 = forge.pkcs12.toPkcs12Asn1(privateKey, cert, password || '', {
      algorithm: '3des',
    });
    const der = forge.asn1.toDer(newPkcs12Asn1).getBytes();
    // Convert to Node Buffer
    return Buffer.from(der, 'binary');
  }

  static async exportCRL(crl: string, format: 'PEM' | 'DER' = 'PEM'): Promise<Blob> {
    switch (format) {
      case 'PEM':
        return new Blob([crl], { type: 'application/x-pem-crl' });
      case 'DER':
        {
          const der = this.pemToDer(crl);
          const arrayBuffer = this.toArrayBuffer(der);
          return new Blob([arrayBuffer], { type: 'application/x-pkcs7-crl' });
        }
      default:
        throw new Error(`Unsupported CRL export format: ${format}`);
    }
  }

  static async exportAuditLogs(
    logs: any[], 
    format: 'CSV' | 'JSON' = 'CSV'
  ): Promise<Blob> {
    const normalized = format.toUpperCase();
    switch (normalized) {
      case 'CSV':
        return this.exportToCSV(logs);
      case 'JSON':
        return new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private static exportToCSV(logs: any[]): Blob {
    if (logs.length === 0) {
      return new Blob([''], { type: 'text/csv' });
    }

    const headers = Object.keys(logs[0]).map(key => 
      key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
    );
    
    const rows = logs.map(log => 
      headers.map(header => {
        const key = header.toLowerCase().replace(/\s+/g, '');
        const value = log[key] || '';
        // Escape quotes and wrap in quotes if contains comma or newline
        if (typeof value === 'string' && (value.includes(',') || value.includes('\n') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      })
    );

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    return new Blob([csvContent], { type: 'text/csv' });
  }

  static getExportFileName(
    type: 'certificate' | 'crl' | 'audit',
    identifier: string,
    format: string,
    timestamp?: Date
  ): string {
    const date = timestamp || new Date();
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');
    
    switch (type) {
      case 'certificate':
        return `certificate-${identifier}-${dateStr}.${format.toLowerCase()}`;
      case 'crl':
        return `crl-${identifier}-${dateStr}.${format.toLowerCase()}`;
      case 'audit':
        return `audit-logs-${dateStr}-${timeStr}.${format.toLowerCase()}`;
      default:
        return `export-${dateStr}.${format.toLowerCase()}`;
    }
  }
}