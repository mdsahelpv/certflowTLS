import forge from 'node-forge';

export type OcspCertStatus = 'good' | 'revoked' | 'unknown';

function generalizedTimeNow(offsetMs = 0): string {
	const d = new Date(Date.now() + offsetMs);
	const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
	return (
		'' +
		d.getUTCFullYear() +
		pad(d.getUTCMonth() + 1) +
		pad(d.getUTCDate()) +
		pad(d.getUTCHours()) +
		pad(d.getUTCMinutes()) +
		pad(d.getUTCSeconds()) +
		'Z'
	);
}

function toOctetString(bytes: string) {
	return forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, bytes);
}

function toIntegerFromHex(hex: string) {
	const bytes = forge.util.hexToBytes(hex.replace(/^0x/, ''));
	return forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false, bytes);
}

function algoIdentifierSha1() {
	// sha1 OID 1.3.14.3.2.26
	return forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
		forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, forge.asn1.oidToDer('1.3.14.3.2.26').getBytes()),
		forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
	]);
}

function algoIdentifierSha256WithRSA() {
	// sha256WithRSAEncryption OID 1.2.840.113549.1.1.11
	return forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
		forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, forge.asn1.oidToDer('1.2.840.113549.1.1.11').getBytes()),
		forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
	]);
}

function getIssuerNameAndKeyHashes(issuerCertPem: string) {
	const cert = forge.pki.certificateFromPem(issuerCertPem);
	const issuerDer = forge.asn1.toDer(forge.pki.distinguishedNameToAsn1(cert.issuer)).getBytes();
	const md1 = forge.md.sha1.create();
	md1.update(issuerDer);
	const issuerNameHash = md1.digest().getBytes();
	const fp = forge.pki.getPublicKeyFingerprint(cert.publicKey, { md: forge.md.sha1.create(), type: 'SubjectPublicKeyInfo' });
	const issuerKeyHash = fp.getBytes ? fp.getBytes() : fp as unknown as string;
	return { issuerNameHash, issuerKeyHash };
}

export function buildBasicOCSPResponseRSA(options: {
	issuerCertPem: string;
	issuerPrivateKeyPem: string;
	serialHex: string;
	status: OcspCertStatus;
	nextUpdateMs?: number;
	includeCert?: boolean;
}): Uint8Array {
	const { issuerNameHash, issuerKeyHash } = getIssuerNameAndKeyHashes(options.issuerCertPem);
	const certID = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
		algoIdentifierSha1(),
		toOctetString(issuerNameHash),
		toOctetString(issuerKeyHash),
		toIntegerFromHex(options.serialHex),
	]);

	let certStatusNode;
	if (options.status === 'good') {
		certStatusNode = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
			forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
		]);
	} else if (options.status === 'revoked') {
		certStatusNode = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 1, true, [
			forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.GENERALIZEDTIME, false, generalizedTimeNow()),
			// reason optional omitted
		]);
	} else {
		certStatusNode = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 2, true, [
			forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
		]);
	}

	const singleResponse = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
		certID,
		certStatusNode,
		forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.GENERALIZEDTIME, false, generalizedTimeNow()),
		forge.asn1.create(
			forge.asn1.Class.CONTEXT_SPECIFIC,
			0,
			true,
			[
				forge.asn1.create(
					forge.asn1.Class.UNIVERSAL,
					forge.asn1.Type.GENERALIZEDTIME,
					false,
					generalizedTimeNow(options.nextUpdateMs ?? 24 * 60 * 60 * 1000)
				),
			]
		),
	]);

	const responderIDByName = forge.asn1.create(
		forge.asn1.Class.UNIVERSAL,
		forge.asn1.Type.SEQUENCE,
		true,
		// Use issuer Name directly from cert
		[forge.pki.certificateFromPem(options.issuerCertPem).issuer.attributes.reduce((nameSeq: any, attr) => nameSeq, forge.pki.distinguishedNameToAsn1(forge.pki.certificateFromPem(options.issuerCertPem).issuer))]
	);

	const responseData = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
		// version omitted (defaults to v1)
		// responderID CHOICE byName
		responderIDByName,
		forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.GENERALIZEDTIME, false, generalizedTimeNow()),
		forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [singleResponse]),
	]);

	const tbsDer = forge.asn1.toDer(responseData).getBytes();
	const privateKey = forge.pki.privateKeyFromPem(options.issuerPrivateKeyPem);
	const md = forge.md.sha256.create();
	md.update(tbsDer);
	const signature = privateKey.sign(md);
	const signatureBitString = String.fromCharCode(0) + signature; // 0 unused bits

	const basicOCSP = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
		responseData,
		algoIdentifierSha256WithRSA(),
		forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.BITSTRING, false, signatureBitString),
		// certs omitted for brevity
	]);

	const basicDer = forge.asn1.toDer(basicOCSP).getBytes();
	const responseBytes = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
		forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
			forge.asn1.create(
				forge.asn1.Class.UNIVERSAL,
				forge.asn1.Type.OID,
				false,
				forge.asn1.oidToDer('1.3.6.1.5.5.7.48.1.1').getBytes() // id-pkix-ocsp-basic
			),
			forge.asn1.create(
				forge.asn1.Class.UNIVERSAL,
				forge.asn1.Type.OCTETSTRING,
				false,
				basicDer
			),
		]),
	]);

	const ocspResponse = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
		forge.asn1.create(
			forge.asn1.Class.UNIVERSAL,
			forge.asn1.Type.ENUMERATED,
			false,
			String.fromCharCode(0) // successful
		),
		responseBytes,
	]);

	const out = forge.asn1.toDer(ocspResponse).getBytes();
	return new Uint8Array(forge.util.createBuffer(out, 'raw').toHex().match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
}