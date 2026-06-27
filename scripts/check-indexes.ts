import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';

async function checkIndexes() {
    const modelsDir = path.join(process.cwd(), 'src/lib/db/models');

    // Recursively find model files
    function getModelFiles(dir: string): string[] {
        const files: string[] = [];
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            if (fs.statSync(fullPath).isDirectory()) {
                files.push(...getModelFiles(fullPath));
            } else if (item.endsWith('.model.ts')) {
                files.push(fullPath);
            }
        }
        return files;
    }

    const modelFiles = getModelFiles(modelsDir);
    console.log(`Found ${modelFiles.length} model files.`);

    for (const file of modelFiles) {
        try {
            // Import the model using relative path from this script location (scripts/)
            // Actually, we can use absolute path or relative to cwd if using tsx
            const relativePath = path.relative(process.cwd(), file);
            // We need to handle default export
            const module = await import(path.resolve(process.cwd(), relativePath));
            const model = module.default;

            if (model && model.schema) {
                const indexes = model.schema.indexes();
                const seenIndexes = new Set<string>();

                // Check field-level unique indexes
                model.schema.eachPath((pathname: string, schemaType: any) => {
                    if (schemaType.options.unique) {
                        const indexName = `${pathname}_1`;
                        // This counts as an index
                        // We don't verify duplication against explicit indexes here easily, 
                        // but we can list them.
                    }
                });

                // Loop through explicit indexes
                indexes.forEach((idx: any) => {
                    const fields = JSON.stringify(idx[0]);
                    const options = JSON.stringify(idx[1]);
                    // check duplication logic if needed, but mainly we want to see what's there
                });
            }
        } catch (err) {
            // Ignore import errors (dependencies etc)
        }
    }

    // Actually, better approach:
    // Just scan the files for duplicate definitions using regex is safer as importing might trigger side effects or fail

    console.log('Script finished (placeholder logic)');
}

checkIndexes();
