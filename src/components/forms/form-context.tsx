'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

type FormSubmissionContextType = {
    answers: Record<string, unknown>;
    setAnswer: (questionId: string, value: unknown) => void;
    isSubmitting: boolean;
    setIsSubmitting: (isSubmitting: boolean) => void;
};

const FormSubmissionContext = createContext<FormSubmissionContextType | undefined>(undefined);

export const FormSubmissionProvider = ({ children }: { children: React.ReactNode }) => {
    const [answers, setAnswers] = useState<Record<string, unknown>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const setAnswer = useCallback((questionId: string, value: unknown) => {
        setAnswers((prev) => ({ ...prev, [questionId]: value }));
    }, []);

    return (
        <FormSubmissionContext.Provider value={{ answers, setAnswer, isSubmitting, setIsSubmitting }}>
            {children}
        </FormSubmissionContext.Provider>
    );
};

export const useFormSubmission = () => {
    const context = useContext(FormSubmissionContext);
    // It's okay if context is undefined (e.g. in Builder mode)
    return context;
};
