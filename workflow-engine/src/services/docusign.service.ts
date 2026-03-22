import docusign from 'docusign-esign';

const BASE_PATH = process.env.DOCUSIGN_BASE_PATH ?? 'https://demo.docusign.net/restapi';
const OAUTH_BASE_PATH = process.env.DOCUSIGN_OAUTH_BASE_PATH ?? 'account-d.docusign.com';

async function getApiClient(): Promise<docusign.ApiClient> {
  const apiClient = new docusign.ApiClient();
  apiClient.setBasePath(BASE_PATH);
  apiClient.setOAuthBasePath(OAUTH_BASE_PATH);

  const results = await apiClient.requestJWTUserToken(
    process.env.DOCUSIGN_CLIENT_ID!,
    process.env.DOCUSIGN_USER_ID!,
    ['signature', 'impersonation'],
    Buffer.from(process.env.DOCUSIGN_PRIVATE_KEY!.replace(/\\n/g, '\n')),
    3600
  );

  const token = results?.body?.access_token;
  if (!token) {
    throw new Error('DocuSign authentication failed: no access token returned');
  }

  console.log('[docusign] authenticated successfully');
  apiClient.addDefaultHeader('Authorization', `Bearer ${token}`);
  return apiClient;
}

export interface SignerParams {
  email: string;
  name: string;
  templateData?: Record<string, string>;
}

export interface SendTemplateParams {
  templateId: string;
  buyer: SignerParams;
  seller: SignerParams;
  emailSubject?: string;
  agreementParty: string;
  jurisdiction: string;
}

export async function sendEnvelopeFromTemplate(params: SendTemplateParams): Promise<{ envelopeId: string }> {
  const apiClient = await getApiClient();
  const envelopesApi = new docusign.EnvelopesApi(apiClient);

  const sharedTabs: docusign.Text[] = [
    { tabLabel: 'Agreement Party', value: params.agreementParty },
    { tabLabel: 'Jurisdiction', value: params.jurisdiction },
  ];

  const toTemplateRole = (roleName: string, signer: SignerParams): docusign.TemplateRole => {
    const signerTabs: docusign.Text[] = signer.templateData
      ? Object.entries(signer.templateData).map(([tabLabel, value]) => ({ tabLabel, value }))
      : [];
    return {
      email: signer.email,
      name: signer.name,
      roleName,
      tabs: { textTabs: [...sharedTabs, ...signerTabs] },
    };
  };

  const envelope: docusign.EnvelopeDefinition = {
    templateId: params.templateId,
    templateRoles: [
      toTemplateRole('Buyer', params.buyer),
      toTemplateRole('Seller', params.seller),
    ],
    emailSubject: params.emailSubject ?? 'Please sign this document',
    status: 'sent',
  };

  const result = await envelopesApi.createEnvelope(process.env.DOCUSIGN_ACCOUNT_ID!, {
    envelopeDefinition: envelope,
  });

  return { envelopeId: result.envelopeId! };
}
