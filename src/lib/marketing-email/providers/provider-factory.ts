
import { BaseMarketingProvider } from './base-provider';
import { BrevoProvider } from './brevo-provider';
import { SESProvider } from './ses-provider';
import { SMTPProvider } from './smtp-provider';
import { IMarketingProvider } from '@/lib/db/models/marketing-email/provider.model';

export class ProviderFactory {
    static create(provider: IMarketingProvider): BaseMarketingProvider {
        switch (provider.type) {
            case 'brevo':
                if (!provider.credentials.apiKey) {
                    throw new Error('Brevo API Key is missing');
                }
                return new BrevoProvider({
                    apiKey: provider.credentials.apiKey
                });

            case 'ses':
                if (!provider.credentials.accessKeyId || !provider.credentials.secretAccessKey || !provider.credentials.region) {
                    throw new Error('AWS SES credentials are incomplete');
                }
                return new SESProvider({
                    accessKeyId: provider.credentials.accessKeyId,
                    secretAccessKey: provider.credentials.secretAccessKey,
                    region: provider.credentials.region
                });

            case 'smtp':
                if (!provider.credentials.host || !provider.credentials.port || !provider.credentials.username || !provider.credentials.password) {
                    throw new Error('SMTP credentials are incomplete');
                }
                return new SMTPProvider({
                    host: provider.credentials.host,
                    port: provider.credentials.port,
                    username: provider.credentials.username,
                    password: provider.credentials.password,
                    secure: provider.credentials.secure || false
                });

            default:
                throw new Error(`Unsupported provider type: ${provider.type}`);
        }
    }
}
