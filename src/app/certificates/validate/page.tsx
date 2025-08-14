'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Shield, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Clock,
  FileText,
  RefreshCw,
  Download
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
    validFrom: Date;
    validTo: Date;
  };
  signature: {
    verified: boolean;
    issuer: string;
  };
  lastValidated: Date;
}

export default function CertificateValidationPage() {
  const { session, isAuthenticated, isLoading } = useAuth('/auth/signin');
  const [certificatePem, setCertificatePem] = useState('');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState('');

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

    setIsValidating(true);
    setError('');
    setValidationResult(null);

    try {
      const response = await fetch('/api/certificates/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          certificatePem: certificatePem.trim(),
          options: {
            checkExpiration: true,
            checkRevocation: true,
            maxChainLength: 10
          }
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setValidationResult(data.result);
      } else {
        setError(data.error || 'Validation failed');
      }
    } catch (error) {
      setError('An error occurred during validation');
    } finally {
      setIsValidating(false);
    }
  };

  const getStatusIcon = (isValid: boolean) => {
    if (isValid) {
      return <CheckCircle className="h-6 w-6 text-green-500" />;
    }
    return <XCircle className="h-6 w-6 text-red-500" />;
  };

  const getStatusBadge = (isValid: boolean) => {
    if (isValid) {
      return <Badge className="bg-green-100 text-green-800">Valid</Badge>;
    }
    return <Badge variant="destructive">Invalid</Badge>;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Certificate Validation
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Validate certificates with full chain validation, signature verification, and expiration checking
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Certificate Input
            </CardTitle>
            <CardDescription>
              Paste the certificate PEM to validate
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="certificate">Certificate PEM</Label>
              <Textarea
                id="certificate"
                placeholder="-----BEGIN CERTIFICATE-----&#10;MII...&#10;-----END CERTIFICATE-----"
                value={certificatePem}
                onChange={(e) => setCertificatePem(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button 
              onClick={handleValidation} 
              disabled={isValidating || !certificatePem.trim()}
              className="w-full"
            >
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
          </CardContent>
        </Card>

        {/* Results Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Validation Results
            </CardTitle>
            <CardDescription>
              Certificate validation status and details
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!validationResult ? (
              <div className="text-center text-gray-500 py-8">
                Enter a certificate and click validate to see results
              </div>
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
                  </div>
                </div>

                {/* Expiration */}
                <div className="space-y-3">
                  <h3 className="font-semibold">Validity Period</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Status:</span>
                      <Badge variant={validationResult.expiration.expired ? "destructive" : "default"}>
                        {validationResult.expiration.expired ? 'Expired' : 'Valid'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Valid From:</span>
                      <span>{validationResult.expiration.validFrom.toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Valid To:</span>
                      <span>{validationResult.expiration.validTo.toLocaleDateString()}</span>
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
                      <Badge variant={validationResult.signature.verified ? "default" : "destructive"}>
                        {validationResult.signature.verified ? 'Verified' : 'Failed'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Issuer:</span>
                      <span className="font-mono">{validationResult.signature.issuer}</span>
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
                  Last validated: {validationResult.lastValidated.toLocaleString()}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
