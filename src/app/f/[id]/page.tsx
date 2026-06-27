import { PublicFormView } from '@/components/forms/public-form-view';
import { FormPasswordGate } from '@/components/forms/form-password-gate';
import { dbConnect } from '@/lib/db/connect';
import FormModel from '@/lib/db/models/form.model';
import mongoose from 'mongoose';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';

type Props = {
    params: Promise<{ id: string }>
}

async function getForm(id: string) {
    await dbConnect();
    const query = mongoose.isValidObjectId(id) ? { _id: id } : { slug: id };
    const form = await FormModel.findOne({ ...query, isPublished: true }).lean();
    return form ? JSON.parse(JSON.stringify(form)) : null;
}

export async function generateMetadata(
    { params }: Props,
): Promise<Metadata> {
    const { id } = await params;
    const form = await getForm(id);

    if (!form) return { title: 'Form Not Found' };

    return {
        title: form.title,
        description: form.settings?.description || 'Fill out this form',
    }
}

export default async function PublicFormPage({ params }: Props) {
    const { id } = await params;
    const form = await getForm(id);

    if (!form) {
        notFound();
    }

    // Show password gate — client component handles auth + form render
    if (form.isPasswordProtected) {
        return <FormPasswordGate formId={form._id.toString()} />;
    }

    try {
        await FormModel.updateOne({ _id: form._id }, { $inc: { views: 1 } });
    } catch (_e) { }

    return <PublicFormView form={form} />;
}
