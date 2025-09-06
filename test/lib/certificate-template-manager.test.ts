/**
 * Certificate Template Manager Tests
 *
 * Comprehensive test suite for certificate template management functionality
 */

import { jest } from '@jest/globals';
import CertificateTemplateManager, {
  CertificateTemplate,
  TemplateValidationResult
} from '../../src/lib/certificate-template-manager';
import { SettingsCacheService } from '../../src/lib/settings-cache';

// Mock dependencies
jest.mock('../../src/lib/settings-cache');
jest.mock('../../src/lib/audit');

describe('CertificateTemplateManager', () => {
  let mockSettingsCacheService: jest.Mocked<typeof SettingsCacheService>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mock implementations
    mockSettingsCacheService = SettingsCacheService as jest.Mocked<typeof SettingsCacheService>;

    // Mock default template collection
    mockSettingsCacheService.getCASetting.mockResolvedValue({
      config: {
        templates: [
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
          }
        ],
        defaultTemplate: 'web-server',
        allowCustomTemplates: true,
        templateValidation: {
          requireKeyUsage: true,
          enforceAlgorithmCompliance: true,
          validateExtensions: true
        }
      }
    });

    mockSettingsCacheService.setCASetting.mockResolvedValue();
  });

  afterEach(() => {
    // Clear template cache
    CertificateTemplateManager.shutdown();
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await expect(CertificateTemplateManager.initialize()).resolves.not.toThrow();
    });

    test('should load templates into cache on initialization', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await CertificateTemplateManager.initialize();

      expect(consoleSpy).toHaveBeenCalledWith('Certificate Template Manager initialized');
      consoleSpy.mockRestore();
    });
  });

  describe('getAllTemplates', () => {
    test('should return all templates', async () => {
      const templates = await CertificateTemplateManager.getAllTemplates();

      expect(templates).toHaveLength(1);
      expect(templates[0]).toMatchObject({
        id: 'web-server',
        name: 'Web Server',
        enabled: true
      });
    });

    test('should return default templates when none configured', async () => {
      mockSettingsCacheService.getCASetting.mockResolvedValue(null);

      const templates = await CertificateTemplateManager.getAllTemplates();

      expect(templates.length).toBeGreaterThan(0);
      expect(templates[0]).toHaveProperty('id');
      expect(templates[0]).toHaveProperty('name');
    });
  });

  describe('getTemplateById', () => {
    test('should return template by ID', async () => {
      const template = await CertificateTemplateManager.getTemplateById('web-server');

      expect(template).toMatchObject({
        id: 'web-server',
        name: 'Web Server',
        enabled: true
      });
    });

    test('should return null for non-existent template', async () => {
      const template = await CertificateTemplateManager.getTemplateById('non-existent');

      expect(template).toBeNull();
    });
  });

  describe('createTemplate', () => {
    test('should create new template successfully', async () => {
      const templateData = {
        name: 'Test Template',
        description: 'A test certificate template',
        enabled: true,
        defaultValidityDays: 365,
        defaultKeySize: '2048' as const,
        defaultAlgorithm: 'RSA' as const,
        allowCustomExtensions: false,
        keyUsage: ['digitalSignature'],
        subjectAlternativeNames: false,
        createdBy: 'test-user'
      };

      const template = await CertificateTemplateManager.createTemplate(templateData, 'test-user');

      expect(template).toMatchObject({
        name: 'Test Template',
        description: 'A test certificate template',
        enabled: true,
        defaultValidityDays: 365
      });
      expect(template.id).toMatch(/^template_\d+_/);
      expect(template.createdBy).toBe('test-user');
      expect(template.usageCount).toBe(0);
    });

    test('should validate template before creation', async () => {
      const invalidTemplateData = {
        name: '', // Invalid: empty name
        description: 'A test certificate template',
        enabled: true,
        defaultValidityDays: 365,
        defaultKeySize: '2048' as const,
        defaultAlgorithm: 'RSA' as const,
        allowCustomExtensions: false,
        keyUsage: [], // Invalid: no key usage
        subjectAlternativeNames: false,
        createdBy: 'test-user'
      };

      await expect(CertificateTemplateManager.createTemplate(invalidTemplateData, 'test-user'))
        .rejects.toThrow('Template validation failed');
    });
  });

  describe('updateTemplate', () => {
    test('should update template successfully', async () => {
      const updates = {
        name: 'Updated Web Server',
        description: 'Updated description'
      };

      const updatedTemplate = await CertificateTemplateManager.updateTemplate('web-server', updates, 'test-user');

      expect(updatedTemplate.name).toBe('Updated Web Server');
      expect(updatedTemplate.description).toBe('Updated description');
      expect(updatedTemplate.updatedAt).toBeInstanceOf(Date);
    });

    test('should validate updated template', async () => {
      const invalidUpdates = {
        keyUsage: [] // Invalid: no key usage
      };

      await expect(CertificateTemplateManager.updateTemplate('web-server', invalidUpdates, 'test-user'))
        .rejects.toThrow('Template validation failed');
    });

    test('should throw error for non-existent template', async () => {
      const updates = { name: 'New Name' };

      await expect(CertificateTemplateManager.updateTemplate('non-existent', updates, 'test-user'))
        .rejects.toThrow('Template not found');
    });
  });

  describe('deleteTemplate', () => {
    test('should delete template successfully', async () => {
      // Create a template first
      const templateData = {
        name: 'Template to Delete',
        description: 'This template will be deleted',
        enabled: true,
        defaultValidityDays: 365,
        defaultKeySize: '2048' as const,
        defaultAlgorithm: 'RSA' as const,
        allowCustomExtensions: false,
        keyUsage: ['digitalSignature'],
        subjectAlternativeNames: false,
        createdBy: 'test-user'
      };

      const template = await CertificateTemplateManager.createTemplate(templateData, 'test-user');

      // Now delete it
      await expect(CertificateTemplateManager.deleteTemplate(template.id, 'test-user'))
        .resolves.not.toThrow();
    });

    test('should prevent deletion of template in use', async () => {
      // Mock template with usage count > 0
      const mockTemplate = {
        id: 'used-template',
        name: 'Used Template',
        description: 'Template that has been used',
        enabled: true,
        defaultValidityDays: 365,
        defaultKeySize: '2048' as const,
        defaultAlgorithm: 'RSA' as const,
        allowCustomExtensions: false,
        keyUsage: ['digitalSignature'],
        subjectAlternativeNames: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
        usageCount: 5 // Template has been used
      };

      // Mock getTemplateById to return template with usage
      const originalGetTemplateById = CertificateTemplateManager.getTemplateById;
      CertificateTemplateManager.getTemplateById = jest.fn().mockResolvedValue(mockTemplate);

      await expect(CertificateTemplateManager.deleteTemplate('used-template', 'test-user'))
        .rejects.toThrow('Cannot delete template that has been used');

      // Restore original method
      CertificateTemplateManager.getTemplateById = originalGetTemplateById;
    });
  });

  describe('duplicateTemplate', () => {
    test('should duplicate template successfully', async () => {
      const duplicatedTemplate = await CertificateTemplateManager.duplicateTemplate('web-server', 'Web Server Copy', 'test-user');

      expect(duplicatedTemplate.name).toBe('Web Server Copy');
      expect(duplicatedTemplate.description).toContain('(Copy)');
      expect(duplicatedTemplate.id).not.toBe('web-server');
    });

    test('should throw error for non-existent template', async () => {
      await expect(CertificateTemplateManager.duplicateTemplate('non-existent', 'Copy', 'test-user'))
        .rejects.toThrow('Original template not found');
    });
  });

  describe('validateTemplate', () => {
    test('should validate valid template successfully', async () => {
      const validTemplate: CertificateTemplate = {
        id: 'valid-template',
        name: 'Valid Template',
        description: 'A valid certificate template',
        enabled: true,
        defaultValidityDays: 365,
        defaultKeySize: '2048',
        defaultAlgorithm: 'RSA',
        allowCustomExtensions: false,
        keyUsage: ['digitalSignature'],
        subjectAlternativeNames: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test-user',
        usageCount: 0
      };

      const result = await CertificateTemplateManager.validateTemplate(validTemplate);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.complianceScore).toBeGreaterThan(80);
    });

    test('should detect validation errors', async () => {
      const invalidTemplate: CertificateTemplate = {
        id: 'invalid-template',
        name: '', // Invalid: empty name
        description: 'An invalid certificate template',
        enabled: true,
        defaultValidityDays: 365,
        defaultKeySize: '2048',
        defaultAlgorithm: 'RSA',
        allowCustomExtensions: false,
        keyUsage: [], // Invalid: no key usage
        subjectAlternativeNames: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test-user',
        usageCount: 0
      };

      const result = await CertificateTemplateManager.validateTemplate(invalidTemplate);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Template name is required');
      expect(result.errors).toContain('At least one key usage must be specified');
      expect(result.complianceScore).toBeLessThan(80);
    });

    test('should provide warnings and suggestions', async () => {
      const templateWithWarnings: CertificateTemplate = {
        id: 'warning-template',
        name: 'Warning Template',
        description: 'Template with warnings',
        enabled: true,
        defaultValidityDays: 1000, // Warning: > 2 years
        defaultKeySize: '1024', // Warning: deprecated
        defaultAlgorithm: 'RSA',
        allowCustomExtensions: false,
        keyUsage: ['digitalSignature'],
        subjectAlternativeNames: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test-user',
        usageCount: 0
      };

      const result = await CertificateTemplateManager.validateTemplate(templateWithWarnings);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('1024-bit keys are deprecated and insecure');
      expect(result.warnings).toContain('Certificate validity exceeds 2 years');
      expect(result.suggestions).toContain('Use 2048-bit or higher key sizes');
    });

    test('should validate CA certificate requirements', async () => {
      const caTemplate: CertificateTemplate = {
        id: 'ca-template',
        name: 'CA Template',
        description: 'Certificate Authority template',
        enabled: true,
        defaultValidityDays: 3650,
        defaultKeySize: '4096',
        defaultAlgorithm: 'RSA',
        allowCustomExtensions: false,
        keyUsage: ['digitalSignature'], // Missing keyCertSign
        subjectAlternativeNames: false,
        basicConstraints: { ca: true }, // CA certificate
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test-user',
        usageCount: 0
      };

      const result = await CertificateTemplateManager.validateTemplate(caTemplate);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('CA certificates must have keyCertSign key usage');
    });
  });

  describe('getUsageStats', () => {
    test('should return usage statistics', async () => {
      const stats = await CertificateTemplateManager.getUsageStats();

      expect(stats).toMatchObject({
        totalTemplates: 1,
        enabledTemplates: 1,
        disabledTemplates: 0,
        algorithmDistribution: { RSA: 1 },
        keySizeDistribution: { '2048': 1 }
      });
      expect(stats.mostUsedTemplate).toBe('Web Server');
    });
  });

  describe('exportTemplates', () => {
    test('should export templates as JSON', async () => {
      const exported = await CertificateTemplateManager.exportTemplates('json');

      expect(exported).toContain('web-server');
      expect(exported).toContain('Web Server');
      expect(() => JSON.parse(exported)).not.toThrow();
    });

    test('should export templates as XML', async () => {
      const exported = await CertificateTemplateManager.exportTemplates('xml');

      expect(exported).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(exported).toContain('<certificateTemplates>');
      expect(exported).toContain('web-server');
    });
  });

  describe('importTemplates', () => {
    test('should import templates successfully', async () => {
      const templatesToImport = [
        {
          id: 'imported-template',
          name: 'Imported Template',
          description: 'A template imported from external source',
          enabled: true,
          defaultValidityDays: 365,
          defaultKeySize: '2048',
          defaultAlgorithm: 'RSA',
          allowCustomExtensions: false,
          keyUsage: ['digitalSignature'],
          subjectAlternativeNames: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'external-user',
          usageCount: 0
        }
      ];

      const result = await CertificateTemplateManager.importTemplates(templatesToImport, 'test-user');

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    test('should skip existing templates when overwrite is false', async () => {
      const existingTemplates = [
        {
          id: 'web-server', // This already exists
          name: 'Existing Template',
          description: 'This template already exists',
          enabled: true,
          defaultValidityDays: 365,
          defaultKeySize: '2048',
          defaultAlgorithm: 'RSA',
          allowCustomExtensions: false,
          keyUsage: ['digitalSignature'],
          subjectAlternativeNames: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'external-user',
          usageCount: 0
        }
      ];

      const result = await CertificateTemplateManager.importTemplates(existingTemplates, 'test-user', false);

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('recordTemplateUsage', () => {
    test('should record template usage', async () => {
      await CertificateTemplateManager.recordTemplateUsage('web-server');

      // Verify that the template's usage count was incremented
      const template = await CertificateTemplateManager.getTemplateById('web-server');
      expect(template?.usageCount).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle configuration errors gracefully', async () => {
      mockSettingsCacheService.getCASetting.mockRejectedValue(new Error('Config error'));

      const templates = await CertificateTemplateManager.getAllTemplates();

      expect(templates.length).toBeGreaterThan(0); // Should return defaults
    });

    test('should handle template creation errors', async () => {
      mockSettingsCacheService.setCASetting.mockRejectedValue(new Error('Save error'));

      const templateData = {
        name: 'Test Template',
        description: 'A test certificate template',
        enabled: true,
        defaultValidityDays: 365,
        defaultKeySize: '2048' as const,
        defaultAlgorithm: 'RSA' as const,
        allowCustomExtensions: false,
        keyUsage: ['digitalSignature'],
        subjectAlternativeNames: false,
        createdBy: 'test-user'
      };

      await expect(CertificateTemplateManager.createTemplate(templateData, 'test-user'))
        .rejects.toThrow('Save error');
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete template lifecycle', async () => {
      // Test the complete workflow: create -> update -> validate -> delete
      const templateData = {
        name: 'Lifecycle Test Template',
        description: 'Template for lifecycle testing',
        enabled: true,
        defaultValidityDays: 365,
        defaultKeySize: '2048' as const,
        defaultAlgorithm: 'RSA' as const,
        allowCustomExtensions: false,
        keyUsage: ['digitalSignature'],
        subjectAlternativeNames: false,
        createdBy: 'test-user'
      };

      // Create
      const template = await CertificateTemplateManager.createTemplate(templateData, 'test-user');
      expect(template.id).toBeDefined();

      // Update
      const updatedTemplate = await CertificateTemplateManager.updateTemplate(
        template.id,
        { description: 'Updated description' },
        'test-user'
      );
      expect(updatedTemplate.description).toBe('Updated description');

      // Validate
      const validation = await CertificateTemplateManager.validateTemplate(updatedTemplate);
      expect(validation.isValid).toBe(true);

      // Delete
      await CertificateTemplateManager.deleteTemplate(template.id, 'test-user');

      // Verify deletion
      const deletedTemplate = await CertificateTemplateManager.getTemplateById(template.id);
      expect(deletedTemplate).toBeNull();
    });
  });
});
