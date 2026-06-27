import { NextRequest, NextResponse } from 'next/server';
import DocumentModel from '@/lib/db/models/document.model';
import FolderModel from '@/lib/db/models/folder.model';
import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db/connect';
import bcrypt from 'bcryptjs';

// Helper to get sidebar (siblings or children)
async function getSidebar(parentId: string, username: string) {
  // We need to fetch subfolders and documents in this parent folder
  const folders = await FolderModel.find({
    parentId: parentId,
    publishedUsername: username,
    isPublished: true
  }).sort({ name: 1 }).select('name _id publishedSlug');

  const documents = await DocumentModel.find({
    folderId: parentId,
    publishedUsername: username,
    isPublished: true
  }).sort({ title: 1 }).select('title _id publishedSlug isPublished');

  return { folders, documents };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const docId = searchParams.get('docId'); // Could be Folder ID too
    const username = searchParams.get('username');

    if (!docId || !username) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Ensure DB connection
    if (mongoose.connection.readyState !== 1) {
      try {
        await dbConnect();
      } catch (_e) {
        // Fallback if dbConnect fails or is structured differently
        await mongoose.connect(process.env.MONGODB_URI!);
      }
    }

    // 1. Try finding as Document
    const doc = await DocumentModel.findOne({
      _id: docId,
      publishedUsername: username,
      isPublished: true
    }).lean();

    if (doc) {
      let sidebar = null;
      let folder = null;

      if (doc.folderId) {
        // Fetch parent folder to see if we should show sidebar
        // Usually only if parent folder is also published
        const parentFolder = await FolderModel.findOne({ _id: doc.folderId, isPublished: true });
        if (parentFolder) {
          folder = parentFolder;
          sidebar = await getSidebar(doc.folderId, username);
        }
      }

      // Check Password Protection
      if (doc.isPasswordProtected) {
        const passwordHeader = req.headers.get('x-doc-password');
        let isAuthorized = false;

        if (passwordHeader && doc.password) {
          isAuthorized = await bcrypt.compare(passwordHeader, doc.password);
        }

        if (!isAuthorized) {
          // Return limited data if not authorized
          return NextResponse.json({
            type: 'document',
            isPasswordProtected: true,
            data: {
              _id: doc._id,
              title: doc.title,
              publishedSlug: doc.publishedSlug,
              isPublished: true,
              updatedAt: doc.updatedAt,
              // NO CONTENT
            },
            folder: folder,
            sidebar: sidebar // Sidebar is safe? Titles are public essentially if listed.
          });
        }
      }

      return NextResponse.json({
        type: 'document',
        data: doc,
        folder: folder, // Context folder
        sidebar: sidebar
      });
    }

    // 2. Try finding as Folder
    const folder = await FolderModel.findOne({
      _id: docId,
      publishedUsername: username,
      isPublished: true
    }).lean();

    if (folder) {
      // Fetch children for sidebar/content
      const sidebar = await getSidebar(String(folder._id), username);

      return NextResponse.json({
        type: 'folder',
        data: folder,
        folder: folder, // Self is folder context
        sidebar: sidebar
      });
    }

    return NextResponse.json({ error: 'Not found or not published' }, { status: 404 });

  } catch (error) {
    console.error('Error fetching public document:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { docId, username, password } = body;

    if (!docId || !username || !password) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    await dbConnect();

    const doc = await DocumentModel.findOne({
      _id: docId,
      publishedUsername: username,
      isPublished: true
    }).select('+password'); // Explicitly select password field to compare

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (!doc.isPasswordProtected) {
      return NextResponse.json({ success: true, authorized: true });
    }

    const isValid = await bcrypt.compare(password, doc.password || '');

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid password', authorized: false }, { status: 401 });
    }

    return NextResponse.json({ success: true, authorized: true });

  } catch (error) {
    console.error('Error verifying password:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
