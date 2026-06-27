import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ParsedContact {
    firstName?: string;
    lastName?: string;
    phone: string;
    email?: string;
    tags?: string[];
    company?: string;
}

export interface ParseResult {
    contacts: ParsedContact[];
    errors: string[];
    totalRows: number;
}

/**
 * CSV/Excel Parser Service
 * Parses contact files and validates data
 */
export class CSVParserService {
    /**
     * Parse CSV file
     */
    async parseCSV(file: File): Promise<ParseResult> {
        return new Promise((resolve) => {
            Papa.parse<Record<string, unknown>>(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    const parsed = this.processRows(results.data);
                    resolve(parsed);
                },
                error: (error) => {
                    resolve({
                        contacts: [],
                        errors: [error.message],
                        totalRows: 0,
                    });
                },
            });
        });
    }

    /**
     * Parse Excel file
     */
    async parseExcel(file: File): Promise<ParseResult> {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });

            // Get first sheet
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            // Convert to JSON
            const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

            return this.processRows(data);
        } catch (error: unknown) {
            return {
                contacts: [],
                errors: [error instanceof Error ? error.message : String(error)],
                totalRows: 0,
            };
        }
    }

    /**
     * Process parsed rows into contacts
     */
    private processRows(rows: Record<string, unknown>[]): ParseResult {
        const contacts: ParsedContact[] = [];
        const errors: string[] = [];

        rows.forEach((row, index) => {
            try {
                const contact = this.mapRowToContact(row);

                if (!contact.phone) {
                    errors.push(`Row ${index + 1}: Missing phone number`);
                    return;
                }

                if (!this.isValidPhone(contact.phone)) {
                    errors.push(`Row ${index + 1}: Invalid phone number format`);
                    return;
                }

                contacts.push(contact);
            } catch (error: unknown) {
                errors.push(`Row ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
            }
        });

        return {
            contacts,
            errors,
            totalRows: rows.length,
        };
    }

    /**
     * Map row data to contact object
     */
    private mapRowToContact(row: Record<string, unknown>): ParsedContact {
        // Support various column name formats
        const nameVal = typeof row.name === 'string' ? row.name : undefined;
        const firstName = (row.firstName || row.first_name || row['First Name'] || nameVal?.split(' ')[0]) as string | undefined;
        const lastName = (row.lastName || row.last_name || row['Last Name'] || nameVal?.split(' ')[1]) as string | undefined;
        const phone = (row.phone || row.phoneNumber || row.phone_number || row['Phone Number'] || row.whatsapp) as string | undefined;
        const email = (row.email || row.Email) as string | undefined;
        const company = (row.company || row.Company) as string | undefined;
        const tagsRaw = row.tags;
        const tags = tagsRaw ? (typeof tagsRaw === 'string' ? tagsRaw.split(',').map((t: string) => t.trim()) : (Array.isArray(tagsRaw) ? tagsRaw as string[] : [])) : [];

        return {
            firstName,
            lastName,
            phone: this.normalizePhone(phone),
            email,
            company,
            tags,
        };
    }

    /**
     * Normalize phone number
     */
    private normalizePhone(phone: string | undefined): string {
        if (!phone) return '';

        // Remove all non-digit characters except +
        let normalized = phone.replace(/[^\d+]/g, '');

        // Ensure it starts with +
        if (!normalized.startsWith('+')) {
            normalized = '+' + normalized;
        }

        return normalized;
    }

    /**
     * Validate phone number format
     */
    private isValidPhone(phone: string): boolean {
        // Basic validation: starts with + and has 10-15 digits
        const phoneRegex = /^\+\d{10,15}$/;
        return phoneRegex.test(phone);
    }
}

export const csvParserService = new CSVParserService();
