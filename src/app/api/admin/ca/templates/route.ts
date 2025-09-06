import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { SettingsValidation } from '@/lib/settings-validation';
import { AuditService } from '@/lib/audit';
import { SettingsCacheService } from '@/lib/settings-cache';

// Certificate Template interface
interface CertificateTemplate {
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
}

// Certificate Template Collection interface
interface CertificateTemplateCollection {
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
interface TemplateUsageStats {
  totalTemplates: number;
  enabledTemplates: number;
  disabledTemplates: number;
  mostUsedTemplate: string;
  totalCertificatesIssued: number;
  averageValidityDays: number;
  algorithmDistribution: Record<string, number>;
  keySizeDistribution: Record<string, number>;
}

// GET - Retrieve certificate templates and statistics
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permissions = (session.user as any).permissions || [];
    if (!permissions.includes('ca:manage')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Get certificate templates from database with caching
    const [
      templateCollection,
      usageStats
    ] = await Promise.all([
      SettingsCacheService.getCASetting('certificate_templates'),
      getTemplateUsageStats()
    ]);

    // Build response configuration
    const config: CertificateTemplateCollection = templateCollection?.config || {
      templates: getDefaultTemplates(),
      defaultTemplate: 'web-server',
      allowCustomTemplates: true,
      templateValidation: {
        requireKeyUsage: true,
        enforceAlgorithmCompliance: true,
        validateExtensions: true
      }
    };

    return NextResponse.json({
      config,
      statistics: usageStats
    });
  } catch (error) {
    console.error('Error fetching certificate templates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Update certificate templates and configuration
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permissions = (session.user as any).permissions || [];
    if (!permissions.includes('ca:manage')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { action, config: updateConfig } = body;
    const userId = (session.user as any).id;
    const username = (session.user as any).username || session.user.email;

    switch (action) {
      case 'updateTemplateCollection':
        // Validate certificate template collection
        if (!updateConfig.templateCollection) {
          return NextResponse.json({ error: 'Certificate template collection is required' }, { status: 400 });
        }

        const collectionValidation = SettingsValidation.validateCertificateTemplateCollection(updateConfig.templateCollection);
        if (!collectionValidation.isValid) {
          return NextResponse.json({
            error: 'Invalid certificate template collection',
            details: collectionValidation.errors
          }, { status: 400 });
        }

        // Get current config for audit logging
        const currentCollection = await SettingsCacheService.getCASetting('certificate_templates');

        // Update certificate template collection in database
        await SettingsCacheService.setCASetting(
          'certificate_templates',
          'Certificate Template Collection',
          updateConfig.templateCollection,
          undefined,
          userId
        );

        // Log the change
        await AuditService.log({
          action: 'CONFIG_UPDATED' as any,
          userId,
          username,
          description: 'Certificate template collection updated',
          metadata: {
            oldConfig: currentCollection?.config,
            newConfig: updateConfig.templateCollection
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Certificate template collection updated successfully'
        });

      case 'createTemplate':
        // Validate individual certificate template
        if (!updateConfig.template) {
          return NextResponse.json({ error: 'Certificate template is required' }, { status: 400 });
        }

        const templateValidation = SettingsValidation.validateCertificateTemplate(updateConfig.template);
        if (!templateValidation.isValid) {
          return NextResponse.json({
            error: 'Invalid certificate template',
            details: templateValidation.errors
          }, { status: 400 });
        }

        const newTemplate = await createCertificateTemplate(updateConfig.template, userId);

        // Log the creation
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Certificate template created: ${updateConfig.template.name}`,
          metadata: {
            templateId: newTemplate.id,
            templateName: updateConfig.template.name
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Certificate template created successfully',
          result: newTemplate
        });

      case 'updateTemplate':
        // Validate updated certificate template
        if (!updateConfig.template || !updateConfig.templateId) {
          return NextResponse.json({ error: 'Certificate template and template ID are required' }, { status: 400 });
        }

        const updateValidation = SettingsValidation.validateCertificateTemplate(updateConfig.template);
        if (!updateValidation.isValid) {
          return NextResponse.json({
            error: 'Invalid certificate template',
            details: updateValidation.errors
          }, { status: 400 });
        }

        const updatedTemplate = await updateCertificateTemplate(updateConfig.templateId, updateConfig.template, userId);

        // Log the update
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Certificate template updated: ${updateConfig.template.name}`,
          metadata: {
            templateId: updateConfig.templateId,
            templateName: updateConfig.template.name
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Certificate template updated successfully',
          result: updatedTemplate
        });

      case 'deleteTemplate':
        // Delete certificate template
        if (!updateConfig.templateId) {
          return NextResponse.json({ error: 'Template ID is required' }, { status: 400 });
        }

        const deleteResult = await deleteCertificateTemplate(updateConfig.templateId, userId);

        // Log the deletion
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Certificate template deleted: ${deleteResult.templateName}`,
          metadata: {
            templateId: updateConfig.templateId,
            templateName: deleteResult.templateName
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Certificate template deleted successfully',
          result: deleteResult
        });

      case 'duplicateTemplate':
        // Duplicate certificate template
        if (!updateConfig.templateId || !updateConfig.newName) {
          return NextResponse.json({ error: 'Template ID and new name are required' }, { status: 400 });
        }

        const duplicatedTemplate = await duplicateCertificateTemplate(updateConfig.templateId, updateConfig.newName, userId);

        // Log the duplication
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Certificate template duplicated: ${duplicatedTemplate.name}`,
          metadata: {
            originalTemplateId: updateConfig.templateId,
            newTemplateId: duplicatedTemplate.id,
            newTemplateName: duplicatedTemplate.name
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Certificate template duplicated successfully',
          result: duplicatedTemplate
        });

      case 'validateTemplate':
        // Validate certificate template configuration
        if (!updateConfig.template) {
          return NextResponse.json({ error: 'Certificate template is required' }, { status: 400 });
        }

        const validationResult = await validateCertificateTemplateConfig(updateConfig.template);

        return NextResponse.json({
          success: true,
          message: 'Certificate template validation completed',
          result: validationResult
        });

      case 'exportTemplates':
        // Export certificate templates
        const exportResult = await exportCertificateTemplates(updateConfig.format || 'json');

        // Log the export
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Certificate templates exported (${exportResult.totalTemplates} templates)`,
          metadata: {
            format: updateConfig.format || 'json',
            totalTemplates: exportResult.totalTemplates
          }
        });

        return NextResponse.json({
          success: true,
          message: `Certificate templates exported successfully: ${exportResult.totalTemplates} templates`,
          result: exportResult
        });

      case 'importTemplates':
        // Import certificate templates
        if (!updateConfig.templates) {
          return NextResponse.json({ error: 'Certificate templates are required' }, { status: 400 });
        }

        const importResult = await importCertificateTemplates(updateConfig.templates, userId);

        // Log the import
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Certificate templates imported: ${importResult.imported} templates`,
          metadata: {
            imported: importResult.imported,
            skipped: importResult.skipped,
            errors: importResult.errors
          }
        });

        return NextResponse.json({
          success: true,
          message: `Certificate templates imported successfully: ${importResult.imported} imported, ${importResult.skipped} skipped`,
          result: importResult
        });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error updating certificate templates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper function to get default certificate templates
function getDefaultTemplates(): CertificateTemplate[] {
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

// Helper function to get template usage statistics
async function getTemplateUsageStats(): Promise<TemplateUsageStats> {
  try {
    // This would integrate with your certificate database to get usage statistics
    // For now, return mock statistics
    const stats: TemplateUsageStats = {
      totalTemplates: 4,
      enabledTemplates: 4,
      disabledTemplates: 0,
      mostUsedTemplate: 'web-server',
      totalCertificatesIssued: 0,
      averageValidityDays: 365,
      algorithmDistribution: { RSA: 4 },
      keySizeDistribution: { '2048': 4 }
    };

    // TODO: Implement actual template usage statistics from your database
    // Example:
    // const totalTemplates = await db.certificateTemplates.count();
    // const enabledTemplates = await db.certificateTemplates.count({ where: { enabled: true } });

    return stats;
  } catch (error) {
    console.error('Error getting template usage stats:', error);
    return {
      totalTemplates: 0,
      enabledTemplates: 0,
      disabledTemplates: 0,
      mostUsedTemplate: '',
      totalCertificatesIssued: 0,
      averageValidityDays: 0,
      algorithmDistribution: {},
      keySizeDistribution: {}
    };
  }
}

// Helper function to create certificate template
async function createCertificateTemplate(template: any, userId: string): Promise<CertificateTemplate> {
  try {
    const newTemplate: CertificateTemplate = {
      id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...template,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: userId,
      usageCount: 0
    };

    // This would save the template to your database
    // For now, just return the template
    return newTemplate;
  } catch (error) {
    console.error('Error creating certificate template:', error);
    throw error;
  }
}

// Helper function to update certificate template
async function updateCertificateTemplate(templateId: string, updates: any, userId: string): Promise<CertificateTemplate> {
  try {
    // This would update the template in your database
    // For now, return mock updated template
    const updatedTemplate: CertificateTemplate = {
      id: templateId,
      ...updates,
      updatedAt: new Date(),
      usageCount: 0
    };

    return updatedTemplate;
  } catch (error) {
    console.error('Error updating certificate template:', error);
    throw error;
  }
}

// Helper function to delete certificate template
async function deleteCertificateTemplate(templateId: string, userId: string): Promise<{ templateName: string }> {
  try {
    // This would delete the template from your database
    // For now, return mock result
    return { templateName: 'Deleted Template' };
  } catch (error) {
    console.error('Error deleting certificate template:', error);
    throw error;
  }
}

// Helper function to duplicate certificate template
async function duplicateCertificateTemplate(templateId: string, newName: string, userId: string): Promise<CertificateTemplate> {
  try {
    // This would duplicate the template in your database
    // For now, return mock duplicated template
    const duplicatedTemplate: CertificateTemplate = {
      id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: newName,
      description: 'Duplicated template',
      enabled: true,
      defaultValidityDays: 365,
      defaultKeySize: '2048',
      defaultAlgorithm: 'RSA',
      allowCustomExtensions: false,
      keyUsage: ['digitalSignature'],
      subjectAlternativeNames: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: userId,
      usageCount: 0
    };

    return duplicatedTemplate;
  } catch (error) {
    console.error('Error duplicating certificate template:', error);
    throw error;
  }
}

// Helper function to validate certificate template configuration
async function validateCertificateTemplateConfig(template: any): Promise<{ isValid: boolean; warnings: string[]; suggestions: string[] }> {
  try {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Check for common configuration issues
    if (template.defaultValidityDays > 365) {
      warnings.push('Certificate validity exceeds 1 year, consider shorter validity for better security');
    }

    if (template.defaultKeySize === '1024') {
      warnings.push('1024-bit keys are deprecated, consider using 2048-bit or higher');
      suggestions.push('Upgrade to 2048-bit or 3072-bit keys');
    }

    if (template.defaultAlgorithm === 'RSA' && template.defaultKeySize === '4096') {
      suggestions.push('Consider using ECDSA with smaller key sizes for better performance');
    }

    if (!template.keyUsage || template.keyUsage.length === 0) {
      warnings.push('No key usage specified, certificate may not be usable for intended purposes');
    }

    if (template.allowCustomExtensions && (!template.customExtensions || template.customExtensions.length === 0)) {
      suggestions.push('Custom extensions allowed but none defined, consider adding standard extensions');
    }

    return {
      isValid: warnings.length === 0,
      warnings,
      suggestions
    };
  } catch (error) {
    console.error('Error validating certificate template:', error);
    return {
      isValid: false,
      warnings: ['Validation failed due to error'],
      suggestions: []
    };
  }
}

// Helper function to export certificate templates
async function exportCertificateTemplates(format: string): Promise<{ totalTemplates: number; data: any; format: string }> {
  try {
    // This would export templates from your database
    // For now, return mock result
    const result = {
      totalTemplates: 4,
      data: getDefaultTemplates(),
      format
    };

    return result;
  } catch (error) {
    console.error('Error exporting certificate templates:', error);
    return {
      totalTemplates: 0,
      data: [],
      format
    };
  }
}

// Helper function to import certificate templates
async function importCertificateTemplates(templates: any[], userId: string): Promise<{ imported: number; skipped: number; errors: string[] }> {
  try {
    // This would import templates to your database
    // For now, return mock result
    const result = {
      imported: templates.length,
      skipped: 0,
      errors: [] as string[]
    };

    return result;
  } catch (error) {
    console.error('Error importing certificate templates:', error);
    return {
      imported: 0,
      skipped: 0,
      errors: [`Import failed: ${error}`]
    };
  }
}
