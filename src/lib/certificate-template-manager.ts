/**
 * Certificate Template Manager
 *
 * Comprehensive certificate template management system
 * Handles template creation, validation, storage, and lifecycle management
 */

import { SettingsCacheService } from './settings-cache';
import { AuditService } from './audit';

// Certificate Template interface
export interface CertificateTemplate {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  defaultValidityDays: number;
  defaultKeySize: '1024' | '2048' | '3072' | '4096';
  defaultAlgorithm: 'RSA' | 'ECDSA';
  allowCustomExtensions: boolean;
  keyUsage: string[];
  extendedKeyUsage?: string[];
  subjectAlternativeNames: boolean;
  basicConstraints?: {
    ca: boolean;
    pathLenConstraint?: number;
  };
  customExtensions?: Array<{
    oid: string;
    critical: boolean;
    value: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  usageCount: number;
  lastUsedAt?: Date;
}

// Certificate Template Collection interface
export interface CertificateTemplateCollection {
  templates: CertificateTemplate[];
  defaultTemplate: string;
  allowCustomTemplates: boolean;
  templateValidation: {
    requireKeyUsage: boolean;
    enforceAlgorithmCompliance: boolean;
    validateExtensions: boolean;
  };
}

// Template Usage Statistics interface
export interface TemplateUsageStats {
  totalTemplates: number;
  enabledTemplates: number;
  disabledTemplates: number;
  mostUsedTemplate: string;
  totalCertificatesIssued: number;
  averageValidityDays: number;
  algorithmDistribution: Record<string, number>;
  keySizeDistribution: Record<string, number>;
  usageByTemplate: Record<string, number>;
}

// Template Validation Result interface
export interface TemplateValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  complianceScore: number;
}

// Certificate Template Manager Class
export class CertificateTemplateManager {
  private static templateCache: Map<string, CertificateTemplate> = new Map();
  private static readonly CACHE_TTL = 300000; // 5 minutes

  // Initialize the certificate template manager
  static async initialize(): Promise<void> {
    try {
      await this.loadTemplatesIntoCache();
      console.log('Certificate Template Manager initialized');
    } catch (error) {
      console.error('Failed to initialize Certificate Template Manager:', error);
    }
  }

  // Get all certificate templates
  static async getAllTemplates(): Promise<CertificateTemplate[]> {
    try {
      const collection = await SettingsCacheService.getCASetting('certificate_templates');
      return collection?.config?.templates || this.getDefaultTemplates();
    } catch (error) {
      console.error('Error getting all templates:', error);
      return this.getDefaultTemplates();
    }
  }

  // Get certificate template by ID
  static async getTemplateById(templateId: string): Promise<CertificateTemplate | null> {
    try {
      // Check cache first
      if (this.templateCache.has(templateId)) {
        return this.templateCache.get(templateId)!;
      }

      const templates = await this.getAllTemplates();
      const template = templates.find(t => t.id === templateId);

      if (template) {
        this.templateCache.set(templateId, template);
      }

      return template || null;
    } catch (error) {
      console.error('Error getting template by ID:', error);
      return null;
    }
  }

  // Create new certificate template
  static async createTemplate(
    templateData: Omit<CertificateTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>,
    userId: string
  ): Promise<CertificateTemplate> {
    try {
      const newTemplate: CertificateTemplate = {
        id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...templateData,
        createdAt: new Date(),
        updatedAt: new Date(),
        usageCount: 0,
        createdBy: userId
      };

      // Validate template
      const validation = await this.validateTemplate(newTemplate);
      if (!validation.isValid) {
        throw new Error(`Template validation failed: ${validation.errors.join(', ')}`);
      }

      // Save template
      await this.saveTemplate(newTemplate);

      // Update cache
      this.templateCache.set(newTemplate.id, newTemplate);

      // Log creation
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId,
        username: userId,
        description: `Certificate template created: ${newTemplate.name}`,
        metadata: {
          templateId: newTemplate.id,
          templateName: newTemplate.name
        }
      });

      return newTemplate;
    } catch (error) {
      console.error('Error creating template:', error);
      throw error;
    }
  }

  // Update certificate template
  static async updateTemplate(
    templateId: string,
    updates: Partial<CertificateTemplate>,
    userId: string
  ): Promise<CertificateTemplate> {
    try {
      const existingTemplate = await this.getTemplateById(templateId);
      if (!existingTemplate) {
        throw new Error('Template not found');
      }

      const updatedTemplate: CertificateTemplate = {
        ...existingTemplate,
        ...updates,
        id: templateId, // Ensure ID doesn't change
        updatedAt: new Date()
      };

      // Validate updated template
      const validation = await this.validateTemplate(updatedTemplate);
      if (!validation.isValid) {
        throw new Error(`Template validation failed: ${validation.errors.join(', ')}`);
      }

      // Save updated template
      await this.saveTemplate(updatedTemplate);

      // Update cache
      this.templateCache.set(templateId, updatedTemplate);

      // Log update
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId,
        username: userId,
        description: `Certificate template updated: ${updatedTemplate.name}`,
        metadata: {
          templateId,
          templateName: updatedTemplate.name,
          changes: Object.keys(updates)
        }
      });

      return updatedTemplate;
    } catch (error) {
      console.error('Error updating template:', error);
      throw error;
    }
  }

  // Delete certificate template
  static async deleteTemplate(templateId: string, userId: string): Promise<void> {
    try {
      const template = await this.getTemplateById(templateId);
      if (!template) {
        throw new Error('Template not found');
      }

      // Check if template is in use
      if (template.usageCount > 0) {
        throw new Error('Cannot delete template that has been used to issue certificates');
      }

      // Remove template
      await this.removeTemplate(templateId);

      // Update cache
      this.templateCache.delete(templateId);

      // Log deletion
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId,
        username: userId,
        description: `Certificate template deleted: ${template.name}`,
        metadata: {
          templateId,
          templateName: template.name
        }
      });
    } catch (error) {
      console.error('Error deleting template:', error);
      throw error;
    }
  }

  // Duplicate certificate template
  static async duplicateTemplate(
    templateId: string,
    newName: string,
    userId: string
  ): Promise<CertificateTemplate> {
    try {
      const originalTemplate = await this.getTemplateById(templateId);
      if (!originalTemplate) {
        throw new Error('Original template not found');
      }

      const duplicatedTemplate = await this.createTemplate({
        ...originalTemplate,
        name: newName,
        description: `${originalTemplate.description} (Copy)`,
        createdBy: userId
      }, userId);

      return duplicatedTemplate;
    } catch (error) {
      console.error('Error duplicating template:', error);
      throw error;
    }
  }

  // Validate certificate template
  static async validateTemplate(template: CertificateTemplate): Promise<TemplateValidationResult> {
    try {
      const errors: string[] = [];
      const warnings: string[] = [];
      const suggestions: string[] = [];
      let complianceScore = 100;

      // Basic validation
      if (!template.name || template.name.length === 0) {
        errors.push('Template name is required');
        complianceScore -= 20;
      }

      if (!template.keyUsage || template.keyUsage.length === 0) {
        errors.push('At least one key usage must be specified');
        complianceScore -= 15;
      }

      // Security validation
      if (template.defaultKeySize === '1024') {
        warnings.push('1024-bit keys are deprecated and insecure');
        suggestions.push('Use 2048-bit or higher key sizes');
        complianceScore -= 10;
      }

      if (template.defaultValidityDays > 825) { // More than 2 years
        warnings.push('Certificate validity exceeds 2 years');
        suggestions.push('Consider shorter validity periods for better security');
        complianceScore -= 5;
      }

      // Algorithm validation
      if (template.defaultAlgorithm === 'RSA' && parseInt(template.defaultKeySize) >= 3072) {
        suggestions.push('Consider using ECDSA for better performance with large key sizes');
        complianceScore -= 2;
      }

      // Extension validation
      if (template.allowCustomExtensions && (!template.customExtensions || template.customExtensions.length === 0)) {
        suggestions.push('Custom extensions enabled but none defined');
      }

      // Compliance checks
      if (template.basicConstraints?.ca && !template.keyUsage.includes('keyCertSign')) {
        errors.push('CA certificates must have keyCertSign key usage');
        complianceScore -= 15;
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        suggestions,
        complianceScore: Math.max(0, complianceScore)
      };
    } catch (error) {
      console.error('Error validating template:', error);
      return {
        isValid: false,
        errors: ['Validation failed due to error'],
        warnings: [],
        suggestions: [],
        complianceScore: 0
      };
    }
  }

  // Get template usage statistics
  static async getUsageStats(): Promise<TemplateUsageStats> {
    try {
      const templates = await this.getAllTemplates();

      const stats: TemplateUsageStats = {
        totalTemplates: templates.length,
        enabledTemplates: templates.filter(t => t.enabled).length,
        disabledTemplates: templates.filter(t => !t.enabled).length,
        mostUsedTemplate: '',
        totalCertificatesIssued: 0,
        averageValidityDays: 0,
        algorithmDistribution: {},
        keySizeDistribution: {},
        usageByTemplate: {}
      };

      let totalUsage = 0;
      let totalValidity = 0;
      let maxUsage = 0;

      for (const template of templates) {
        // Usage statistics
        stats.usageByTemplate[template.id] = template.usageCount;
        totalUsage += template.usageCount;
        totalValidity += template.defaultValidityDays;

        if (template.usageCount > maxUsage) {
          maxUsage = template.usageCount;
          stats.mostUsedTemplate = template.name;
        }

        // Algorithm distribution
        stats.algorithmDistribution[template.defaultAlgorithm] =
          (stats.algorithmDistribution[template.defaultAlgorithm] || 0) + 1;

        // Key size distribution
        stats.keySizeDistribution[template.defaultKeySize] =
          (stats.keySizeDistribution[template.defaultKeySize] || 0) + 1;
      }

      stats.totalCertificatesIssued = totalUsage;
      stats.averageValidityDays = templates.length > 0 ? totalValidity / templates.length : 0;

      return stats;
    } catch (error) {
      console.error('Error getting usage stats:', error);
      return {
        totalTemplates: 0,
        enabledTemplates: 0,
        disabledTemplates: 0,
        mostUsedTemplate: '',
        totalCertificatesIssued: 0,
        averageValidityDays: 0,
        algorithmDistribution: {},
        keySizeDistribution: {},
        usageByTemplate: {}
      };
    }
  }

  // Export templates
  static async exportTemplates(format: 'json' | 'xml' = 'json'): Promise<string> {
    try {
      const templates = await this.getAllTemplates();

      if (format === 'xml') {
        return this.convertTemplatesToXML(templates);
      } else {
        return JSON.stringify(templates, null, 2);
      }
    } catch (error) {
      console.error('Error exporting templates:', error);
      throw error;
    }
  }

  // Import templates
  static async importTemplates(
    templatesData: any[],
    userId: string,
    overwriteExisting: boolean = false
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    try {
      const result = {
        imported: 0,
        skipped: 0,
        errors: [] as string[]
      };

      for (const templateData of templatesData) {
        try {
          // Check if template already exists
          const existingTemplate = await this.getTemplateById(templateData.id);

          if (existingTemplate && !overwriteExisting) {
            result.skipped++;
            continue;
          }

          // Create or update template
          if (existingTemplate) {
            await this.updateTemplate(templateData.id, templateData, userId);
          } else {
            await this.createTemplate(templateData, userId);
          }

          result.imported++;
        } catch (error) {
          result.errors.push(`Failed to import template ${templateData.name}: ${error}`);
        }
      }

      return result;
    } catch (error) {
      console.error('Error importing templates:', error);
      throw error;
    }
  }

  // Record template usage
  static async recordTemplateUsage(templateId: string): Promise<void> {
    try {
      const template = await this.getTemplateById(templateId);
      if (template) {
        template.usageCount++;
        template.lastUsedAt = new Date();

        await this.saveTemplate(template);
        this.templateCache.set(templateId, template);
      }
    } catch (error) {
      console.error('Error recording template usage:', error);
    }
  }

  // Get default templates
  private static getDefaultTemplates(): CertificateTemplate[] {
    return [
      {
        id: 'web-server',
        name: 'Web Server',
        description: 'Standard SSL/TLS certificate for web servers',
        enabled: true,
        defaultValidityDays: 365,
        defaultKeySize: '2048',
        defaultAlgorithm: 'RSA',
        allowCustomExtensions: false,
        keyUsage: ['digitalSignature', 'keyEncipherment'],
        extendedKeyUsage: ['serverAuth'],
        subjectAlternativeNames: true,
        basicConstraints: { ca: false },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
        usageCount: 0
      },
      {
        id: 'client-auth',
        name: 'Client Authentication',
        description: 'Certificate for client authentication',
        enabled: true,
        defaultValidityDays: 365,
        defaultKeySize: '2048',
        defaultAlgorithm: 'RSA',
        allowCustomExtensions: false,
        keyUsage: ['digitalSignature', 'keyAgreement'],
        extendedKeyUsage: ['clientAuth'],
        subjectAlternativeNames: false,
        basicConstraints: { ca: false },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
        usageCount: 0
      },
      {
        id: 'code-signing',
        name: 'Code Signing',
        description: 'Certificate for code signing',
        enabled: true,
        defaultValidityDays: 365,
        defaultKeySize: '2048',
        defaultAlgorithm: 'RSA',
        allowCustomExtensions: false,
        keyUsage: ['digitalSignature'],
        extendedKeyUsage: ['codeSigning'],
        subjectAlternativeNames: false,
        basicConstraints: { ca: false },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
        usageCount: 0
      },
      {
        id: 'email-protection',
        name: 'Email Protection',
        description: 'Certificate for S/MIME email encryption and signing',
        enabled: true,
        defaultValidityDays: 365,
        defaultKeySize: '2048',
        defaultAlgorithm: 'RSA',
        allowCustomExtensions: false,
        keyUsage: ['digitalSignature', 'keyEncipherment'],
        extendedKeyUsage: ['emailProtection'],
        subjectAlternativeNames: false,
        basicConstraints: { ca: false },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
        usageCount: 0
      }
    ];
  }

  // Load templates into cache
  private static async loadTemplatesIntoCache(): Promise<void> {
    try {
      const templates = await this.getAllTemplates();
      this.templateCache.clear();

      for (const template of templates) {
        this.templateCache.set(template.id, template);
      }
    } catch (error) {
      console.error('Error loading templates into cache:', error);
    }
  }

  // Save template
  private static async saveTemplate(template: CertificateTemplate): Promise<void> {
    try {
      const collection = await SettingsCacheService.getCASetting('certificate_templates');
      const templates = collection?.config?.templates || [];

      const existingIndex = templates.findIndex(t => t.id === template.id);
      if (existingIndex >= 0) {
        templates[existingIndex] = template;
      } else {
        templates.push(template);
      }

      const updatedCollection = {
        ...collection?.config,
        templates
      };

      await SettingsCacheService.setCASetting(
        'certificate_templates',
        'Certificate Template Collection',
        updatedCollection
      );
    } catch (error) {
      console.error('Error saving template:', error);
      throw error;
    }
  }

  // Remove template
  private static async removeTemplate(templateId: string): Promise<void> {
    try {
      const collection = await SettingsCacheService.getCASetting('certificate_templates');
      const templates = collection?.config?.templates || [];

      const filteredTemplates = templates.filter(t => t.id !== templateId);

      const updatedCollection = {
        ...collection?.config,
        templates: filteredTemplates
      };

      await SettingsCacheService.setCASetting(
        'certificate_templates',
        'Certificate Template Collection',
        updatedCollection
      );
    } catch (error) {
      console.error('Error removing template:', error);
      throw error;
    }
  }

  // Convert templates to XML
  private static convertTemplatesToXML(templates: CertificateTemplate[]): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<certificateTemplates>\n';

    for (const template of templates) {
      xml += `  <template id="${template.id}">\n`;
      xml += `    <name>${this.escapeXml(template.name)}</name>\n`;
      xml += `    <description>${this.escapeXml(template.description)}</description>\n`;
      xml += `    <enabled>${template.enabled}</enabled>\n`;
      xml += `    <defaultValidityDays>${template.defaultValidityDays}</defaultValidityDays>\n`;
      xml += `    <defaultKeySize>${template.defaultKeySize}</defaultKeySize>\n`;
      xml += `    <defaultAlgorithm>${template.defaultAlgorithm}</defaultAlgorithm>\n`;
      xml += `    <allowCustomExtensions>${template.allowCustomExtensions}</allowCustomExtensions>\n`;
      xml += `    <keyUsage>${template.keyUsage.join(',')}</keyUsage>\n`;
      if (template.extendedKeyUsage) {
        xml += `    <extendedKeyUsage>${template.extendedKeyUsage.join(',')}</extendedKeyUsage>\n`;
      }
      xml += `    <subjectAlternativeNames>${template.subjectAlternativeNames}</subjectAlternativeNames>\n`;
      xml += `  </template>\n`;
    }

    xml += '</certificateTemplates>';
    return xml;
  }

  // Escape XML characters
  private static escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '<';
        case '>': return '>';
        case '&': return '&';
        case '\'': return '&#39;';
        case '"': return '"';
        default: return c;
      }
    });
  }

  // Shutdown the template manager
  static shutdown(): void {
    this.templateCache.clear();
    console.log('Certificate Template Manager shut down');
  }
}

// Export utilities
export const getAllCertificateTemplates = CertificateTemplateManager.getAllTemplates.bind(CertificateTemplateManager);
export const getCertificateTemplateById = CertificateTemplateManager.getTemplateById.bind(CertificateTemplateManager);
export const createCertificateTemplate = CertificateTemplateManager.createTemplate.bind(CertificateTemplateManager);
export const updateCertificateTemplate = CertificateTemplateManager.updateTemplate.bind(CertificateTemplateManager);
export const deleteCertificateTemplate = CertificateTemplateManager.deleteTemplate.bind(CertificateTemplateManager);
export const duplicateCertificateTemplate = CertificateTemplateManager.duplicateTemplate.bind(CertificateTemplateManager);
export const validateCertificateTemplateConfig = CertificateTemplateManager.validateTemplate.bind(CertificateTemplateManager);
export const getCertificateTemplateStats = CertificateTemplateManager.getUsageStats.bind(CertificateTemplateManager);
export const exportCertificateTemplates = CertificateTemplateManager.exportTemplates.bind(CertificateTemplateManager);
export const importCertificateTemplates = CertificateTemplateManager.importTemplates.bind(CertificateTemplateManager);
export const recordCertificateTemplateUsage = CertificateTemplateManager.recordTemplateUsage.bind(CertificateTemplateManager);
export const initializeCertificateTemplateManager = CertificateTemplateManager.initialize.bind(CertificateTemplateManager);

export default CertificateTemplateManager;
