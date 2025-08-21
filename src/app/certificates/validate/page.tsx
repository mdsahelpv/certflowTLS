'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  RefreshCw,
  Settings,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface ValidationResult {
  isValid: boolean;
  issues: string[];
  chain: Array<{ cert: any; status: string }>;
  chainInfo: {
    chainLength: number;
    isComplete: boolean;
    rootCA: string | null;
    intermediateCAs: string[];
    endEntity: string;
  };
  expiration: {
    expired: boolean;
    daysUntilExpiry: number;
    validFrom: Date | string;
    validTo: Date | string;
  };
  signature: {
    verified: boolean;
    issuer: string;
  };
  lastValidated: Date | string;
  cached: boolean;
}

export default function CertificateValidationPage() {
  const { isAuthenticated, isLoading } = useAuth('/auth/signin');
  const [certificatePem, setCertificatePem] = useState('');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  // Advanced validation options
  const [validationOptions, setValidationOptions] = useState({
    checkExpiration: true,
    checkRevocation: true,
    requireTrustedRoot: true,
    validateExtensions: true,
    checkKeyUsage: true,
    checkBasicConstraints: true,
    maxChainLength: 10
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const handleValidation = async () => {
    if (!certificatePem.trim()) {
      setError('Please enter a certificate PEM');
      return;
    }
    
    // Enhanced PEM validation
    const trimmedPem = certificatePem.trim();
    if (!/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----$/.test(trimmedPem)) {
      setError('Input does not look like a valid PEM certificate. Please paste a correct certificate.');
      return;
    }

    // Size validation
    if (trimmedPem.length > 50000) {
      setError('Certificate too large. Maximum size is 50KB.');
      return;
    }

    setIsValidating(true);
    setError('');
    setSuccessMessage('');
    setValidationResult(null);

    try {
      const response = await fetch('/api/certificates/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificatePem: trimmedPem,
          options: validationOptions,
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setValidationResult(data.result);
        setSuccessMessage(`Certificate validation completed successfully at ${new Date().toLocaleString()}`);
      } else {
        // Handle specific error cases
        if (response.status === 429) {
          setError('Rate limit exceeded. Please wait a moment before trying again.');
        } else if (response.status === 400) {
          setError(data.error || 'Invalid certificate format');
        } else if (response.status === 401) {
          setError('Authentication required. Please sign in again.');
        } else {
          setError(data.error || 'Validation failed');
        }
      }
    } catch (e) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsValidating(false);
    }
  };

  const getStatusIcon = (ok: boolean) => (ok ? <CheckCircle className="h-6 w-6 text-green-500" /> : <XCircle className="h-6 w-6 text-red-500" />);
  const getStatusBadge = (ok: boolean) => (ok ? <Badge className="bg-green-100 text-green-800">Valid</Badge> : <Badge variant="destructive">Invalid</Badge>);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Certificate Validation</h1>
        <p className="text-gray-600 dark:text-gray-400">Validate certificates with full chain validation, signature verification, and expiration checking</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Certificate Input
            </CardTitle>
            <CardDescription>Paste the certificate PEM to validate</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="certificate">Certificate PEM</Label>
              <Textarea
                id="certificate"
                placeholder="-----BEGIN CERTIFICATE-----\nMII...\n-----END CERTIFICATE-----"
                value={certificatePem}
                onChange={(e) => setCertificatePem(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription className="font-medium">{error}</AlertDescription>
              </Alert>
            )}
            {successMessage && (
              <Alert variant="success">
                <CheckCircle className="h-4 w-4" />
                <AlertDescription className="font-medium">{successMessage}</AlertDescription>
              </Alert>
            )}
            
            {/* Advanced Validation Options */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-2 h-auto">
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    <span>Advanced Validation Options</span>
                  </div>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="checkExpiration"
                      checked={validationOptions.checkExpiration}
                      onCheckedChange={(checked) => 
                        setValidationOptions(prev => ({ ...prev, checkExpiration: !!checked }))
                      }
                    />
                    <Label htmlFor="checkExpiration" className="text-sm">Check Expiration</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="checkRevocation"
                      checked={validationOptions.checkRevocation}
                      onCheckedChange={(checked) => 
                        setValidationOptions(prev => ({ ...prev, checkRevocation: !!checked }))
                      }
                    />
                    <Label htmlFor="checkRevocation" className="text-sm">Check Revocation</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="requireTrustedRoot"
                      checked={validationOptions.requireTrustedRoot}
                      onCheckedChange={(checked) => 
                        setValidationOptions(prev => ({ ...prev, requireTrustedRoot: !!checked }))
                      }
                    />
                    <Label htmlFor="requireTrustedRoot" className="text-sm">Require Trusted Root</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="validateExtensions"
                      checked={validationOptions.validateExtensions}
                      onCheckedChange={(checked) => 
                        setValidationOptions(prev => ({ ...prev, validateExtensions: !!checked }))
                      }
                    />
                    <Label htmlFor="validateExtensions" className="text-sm">Validate Extensions</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="checkKeyUsage"
                      checked={validationOptions.checkKeyUsage}
                      onCheckedChange={(checked) => 
                        setValidationOptions(prev => ({ ...prev, checkKeyUsage: !!checked }))
                      }
                    />
                    <Label htmlFor="checkKeyUsage" className="text-sm">Check Key Usage</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="checkBasicConstraints"
                      checked={validationOptions.checkBasicConstraints}
                      onCheckedChange={(checked) => 
                        setValidationOptions(prev => ({ ...prev, checkBasicConstraints: !!checked }))
                      }
                    />
                    <Label htmlFor="checkBasicConstraints" className="text-sm">Check Basic Constraints</Label>
                  </div>
                </div>
                
                {/* Cache Management */}
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <h4 className="font-medium text-sm mb-3 text-blue-800 dark:text-blue-200">Cache Management</h4>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={async () => {
                        try {
                          const response = await fetch('/api/certificates/validate?action=cache-clear');
                          if (response.ok) {
                            setSuccessMessage('Cache cleared successfully');
                          }
                        } catch (e) {
                          setError('Failed to clear cache');
                        }
                      }}
                    >
                      Clear Cache
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={async () => {
                        try {
                          const response = await fetch('/api/certificates/validate?action=cache-stats');
                          if (response.ok) {
                            const data = await response.json();
                            setSuccessMessage(`Cache stats: ${data.statistics.size} items, ${Math.round(data.statistics.hitRate * 100)}% hit rate`);
                          }
                        } catch (e) {
                          setError('Failed to get cache stats');
                        }
                      }}
                    >
                      Cache Stats
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
            
            <div className="flex gap-2">
              <Button onClick={handleValidation} disabled={isValidating || !certificatePem.trim()} className="flex-1">
                {isValidating ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    <Shield className="mr-2 h-4 w-4" />
                    Validate Certificate
                  </>
                )}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setCertificatePem('');
                  setValidationResult(null);
                  setError('');
                  setSuccessMessage('');
                }}
                disabled={isValidating}
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Validation Results
            </CardTitle>
            <CardDescription>Certificate validation status and details</CardDescription>
          </CardHeader>
          <CardContent>
            {!validationResult ? (
              <div className="text-center text-gray-500 py-8">Enter a certificate and click validate to see results</div>
            ) : (
              <div className="space-y-6">
                {/* Overall Status */}
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(validationResult.isValid)}
                    <div>
                      <p className="font-semibold">Overall Status</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {validationResult.isValid ? 'Certificate is valid' : 'Certificate has issues'}
                      </p>
                      {validationResult.cached && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          ⚡ Result served from cache
                        </p>
                      )}
                    </div>
                  </div>
                  {getStatusBadge(validationResult.isValid)}
                </div>

                {/* Chain Information */}
                <div className="space-y-3">
                  <h3 className="font-semibold">Certificate Chain</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Chain Length:</span>
                      <Badge variant="outline">{validationResult.chainInfo.chainLength}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>End Entity:</span>
                      <span className="font-mono">{validationResult.chainInfo.endEntity}</span>
                    </div>
                    {validationResult.chainInfo.rootCA && (
                      <div className="flex items-center justify-between text-sm">
                        <span>Root CA:</span>
                        <span className="font-mono">{validationResult.chainInfo.rootCA}</span>
                      </div>
                    )}
                    {validationResult.chainInfo.intermediateCAs.length > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span>Intermediate CAs:</span>
                        <span className="font-mono">{validationResult.chainInfo.intermediateCAs.join(', ')}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span>Trust Status:</span>
                      <Badge variant={validationResult.chainInfo.rootCA ? 'default' : 'secondary'}>
                        {validationResult.chainInfo.rootCA ? 'Trusted Root' : 'Untrusted Root'}
                      </Badge>
                    </div>
                  </div>
                  
                  {/* Detailed Chain Display */}
                  {validationResult.chain.length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium text-sm mb-2">Chain Details:</h4>
                      <div className="space-y-2">
                        {validationResult.chain.map((chainItem, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-mono">#{index + 1}</span>
                              <span className="font-mono">
                                {chainItem.cert.subject.getField('CN')?.value || 'Unknown CN'}
                              </span>
                            </div>
                            <Badge 
                              variant={
                                chainItem.status === 'trusted_root' ? 'default' : 
                                chainItem.status === 'untrusted_root' ? 'destructive' : 
                                'secondary'
                              }
                            >
                              {chainItem.status === 'trusted_root' ? 'Trusted Root' :
                               chainItem.status === 'untrusted_root' ? 'Untrusted Root' :
                               chainItem.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Expiration */}
                <div className="space-y-3">
                  <h3 className="font-semibold">Validity Period</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Status:</span>
                      <Badge variant={validationResult.expiration.expired ? 'destructive' : 'default'}>
                        {validationResult.expiration.expired ? 'Expired' : 'Valid'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Valid From:</span>
                      <span>{new Date(validationResult.expiration.validFrom as any).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Valid To:</span>
                      <span>{new Date(validationResult.expiration.validTo as any).toLocaleDateString()}</span>
                    </div>
                    {!validationResult.expiration.expired && (
                      <div className="flex items-center justify-between text-sm">
                        <span>Days Until Expiry:</span>
                        <Badge variant="outline">{validationResult.expiration.daysUntilExpiry}</Badge>
                      </div>
                    )}
                  </div>
                </div>

                {/* Signature */}
                <div className="space-y-3">
                  <h3 className="font-semibold">Signature Verification</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Status:</span>
                      <Badge variant={validationResult.signature.verified ? 'default' : 'destructive'}>
                        {validationResult.signature.verified ? 'Verified' : 'Failed'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Issuer:</span>
                      <span className="font-mono">{validationResult.signature.issuer}</span>
                    </div>
                  </div>
                </div>

                {/* Validation Summary */}
                <div className="space-y-3">
                  <h3 className="font-semibold">Validation Summary</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center justify-between text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded">
                      <span>Chain Validation:</span>
                      <Badge variant={validationResult.chainInfo.isComplete ? 'default' : 'destructive'}>
                        {validationResult.chainInfo.isComplete ? 'Passed' : 'Failed'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded">
                      <span>Expiration Check:</span>
                      <Badge variant={!validationResult.expiration.expired ? 'default' : 'destructive'}>
                        {!validationResult.expiration.expired ? 'Passed' : 'Failed'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded">
                      <span>Signature Check:</span>
                      <Badge variant={validationResult.signature.verified ? 'default' : 'destructive'}>
                        {validationResult.signature.verified ? 'Passed' : 'Failed'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded">
                      <span>Trust Root:</span>
                      <Badge variant={validationResult.chainInfo.rootCA ? 'default' : 'secondary'}>
                        {validationResult.chainInfo.rootCA ? 'Found' : 'Missing'}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Issues */}
                {validationResult.issues.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-red-600">Issues Found</h3>
                    <div className="space-y-2">
                      {validationResult.issues.map((issue, index) => (
                        <Alert key={index} variant="destructive">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>{issue}</AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  </div>
                )}

                {/* Last Validated */}
                <div className="text-sm text-gray-500 text-center">
                  Last validated: {new Date(validationResult.lastValidated as any).toLocaleString()}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

