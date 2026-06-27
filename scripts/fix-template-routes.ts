// This file provides a helper to fix all the template API routes
// Run with: npx tsx scripts/fix-template-routes.ts

import * as fs from 'fs';
import * as path from 'path';

const files = [
    'src/app/api/admin/templates/docs/route.ts',
    'src/app/api/admin/templates/forms/[id]/route.ts',
    'src/app/api/admin/templates/docs/[id]/route.ts',
];

for (const file of files) {
    const filePath = path.join(process.cwd(), file);
    let content = fs.readFileSync(filePath, 'utf-8');

    // Fix imports
    content = content.replace(
        /import { getServerSession } from 'next-auth';\r?\nimport { authOptions } from '@\/lib\/auth';/g,
        "import { auth } from '@/auth';"
    );

    // Fix function calls
    content = content.replace(/getServerSession\(authOptions\)/g, 'auth()');

    // Add null checks for user where missing
    if (content.includes('createdBy: user._id') && !content.includes('if (!user)')) {
        content = content.replace(
            /(const user = await User\.findOne\({ email: session\?\.user\?\.email }\);)\r?\n/g,
            '$1\n        if (!user) {\n            return NextResponse.json({ error: \'User not found\' }, { status: 404 });\n        }\n'
        );
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Fixed: ${file}`);
}

console.log('All files fixed!');
