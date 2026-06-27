import mongoose from 'mongoose';
import MediaFolder, { IMediaFolder } from '../models/media-folder.model';
import MediaAsset from '../models/media-asset.model';

export interface CreateMediaFolderInput {
    brandId: string;
    userId: string;
    name: string;
    parentId?: string;
    color?: string;
}

export interface UpdateMediaFolderInput {
    name?: string;
    parentId?: string | null;
    color?: string;
}

export class MediaFolderRepository {
    /**
     * Create a new folder
     */
    async create(input: CreateMediaFolderInput): Promise<IMediaFolder> {
        await this.ensureConnection();

        const folder = new MediaFolder({
            ...input,
            assetCount: 0,
        });

        return folder.save();
    }

    /**
     * Find folder by ID
     */
    async findById(folderId: string): Promise<IMediaFolder | null> {
        await this.ensureConnection();
        return MediaFolder.findById(folderId).exec();
    }

    /**
     * Find all folders for a brand
     */
    async findByBrand(brandId: string): Promise<IMediaFolder[]> {
        await this.ensureConnection();
        return MediaFolder.find({ brandId })
            .sort({ name: 1 })
            .exec();
    }

    /**
     * Find top-level folders (no parent)
     */
    async findRootFolders(brandId: string): Promise<IMediaFolder[]> {
        await this.ensureConnection();
        return MediaFolder.find({ brandId, parentId: null })
            .sort({ name: 1 })
            .exec();
    }

    /**
     * Find child folders
     */
    async findChildren(parentId: string): Promise<IMediaFolder[]> {
        await this.ensureConnection();
        return MediaFolder.find({ parentId })
            .sort({ name: 1 })
            .exec();
    }

    /**
     * Update folder
     */
    async update(folderId: string, data: UpdateMediaFolderInput): Promise<IMediaFolder | null> {
        await this.ensureConnection();

        const updateData: Record<string, unknown> = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.parentId !== undefined) updateData.parentId = data.parentId;
        if (data.color !== undefined) updateData.color = data.color;

        return MediaFolder.findByIdAndUpdate(
            folderId,
            { $set: updateData },
            { new: true }
        ).exec();
    }

    /**
     * Delete folder (and move assets to root)
     */
    async delete(folderId: string): Promise<boolean> {
        await this.ensureConnection();

        // Move all assets in this folder to root
        await MediaAsset.updateMany(
            { folderId },
            { $set: { folderId: null } }
        );

        // Move all child folders to root
        await MediaFolder.updateMany(
            { parentId: folderId },
            { $set: { parentId: null } }
        );

        const result = await MediaFolder.deleteOne({ _id: folderId });
        return result.deletedCount > 0;
    }

    /**
     * Get folder tree (nested structure)
     */
    async getFolderTree(brandId: string): Promise<FolderTreeNode[]> {
        await this.ensureConnection();

        const folders = await MediaFolder.find({ brandId })
            .sort({ name: 1 })
            .lean()
            .exec();

        // Build tree structure
        const folderMap = new Map<string, FolderTreeNode>();
        const rootNodes: FolderTreeNode[] = [];

        // First pass: create all nodes
        folders.forEach((folder) => {
            // @ts-expect-error
            folderMap.set(folder._id.toString(), {
                ...folder,
                _id: folder._id.toString(),
                children: [],
            });
        });

        // Second pass: build tree
        folders.forEach((folder) => {
            const node = folderMap.get(folder._id.toString())!;
            if (folder.parentId) {
                const parent = folderMap.get(folder.parentId);
                if (parent) {
                    parent.children.push(node);
                } else {
                    rootNodes.push(node);
                }
            } else {
                rootNodes.push(node);
            }
        });

        return rootNodes;
    }

    /**
     * Ensure MongoDB connection
     */
    private async ensureConnection(): Promise<void> {
        if (mongoose.connection.readyState !== 1) {
            const { connectMongoose } = await import('@/lib/mongodb');
            await connectMongoose();
        }
    }
}

export interface FolderTreeNode extends Omit<IMediaFolder, '_id' | 'id'> {
    _id: string;
    children: FolderTreeNode[];
}

// Export singleton instance
export const mediaFolderRepository = new MediaFolderRepository();
