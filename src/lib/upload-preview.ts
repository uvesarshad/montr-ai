/**
 * Upload canvas preview to S3
 * This replaces the Firebase Storage upload
 */
export async function uploadCanvasPreview(
    canvasId: string,
    userId: string,
    previewDataUrl: string
): Promise<string> {
    try {
        const response = await fetch(`/api/v2/canvases/${canvasId}/preview`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                previewData: previewDataUrl,
                userId,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to upload preview');
        }

        const data = await response.json();
        return data.previewUrl;
    } catch (error) {
        console.error('Error uploading canvas preview:', error);
        throw error;
    }
}
