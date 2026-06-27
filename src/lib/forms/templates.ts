/**
 * Prebuilt Form Templates
 * 
 * Each template contains a pre-configured form structure in Tiptap JSON format
 * with common fields for specific use cases.
 */

export interface FormTemplate {
    id: string;
    title: string;
    description: string;
    icon: 'Mail' | 'BarChart2' | 'FileText';
    content: string; // Tiptap JSON stringified
    settings: {
        theme?: string;
        emailNotifications?: boolean;
        submitButtonText?: string;
        thankYouMessage?: string;
    };
}

export const FORM_TEMPLATES: FormTemplate[] = [
    {
        id: 'contact-form',
        title: 'Contact Form',
        description: 'Simple contact form for leads.',
        icon: 'Mail',
        content: JSON.stringify({
            type: 'doc',
            content: [
                {
                    type: 'heading',
                    attrs: { level: 1 },
                    content: [{ type: 'text', text: 'Contact Us' }]
                },
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'We\'d love to hear from you. Please fill out the form below and we\'ll get back to you as soon as possible.' }]
                },
                {
                    type: 'formShortText',
                    attrs: {
                        id: 'full-name',
                        label: 'Full Name',
                        placeholder: 'John Doe',
                        required: true
                    }
                },
                {
                    type: 'formEmail',
                    attrs: {
                        id: 'email',
                        label: 'Email Address',
                        placeholder: 'john@example.com',
                        required: true
                    }
                },
                {
                    type: 'formPhone',
                    attrs: {
                        id: 'phone',
                        label: 'Phone Number',
                        placeholder: '+1 (555) 000-0000',
                        required: false
                    }
                },
                {
                    type: 'formDropdown',
                    attrs: {
                        id: 'subject',
                        label: 'Subject',
                        options: ['General Inquiry', 'Sales', 'Support', 'Partnership'],
                        required: true
                    }
                },
                {
                    type: 'formLongText',
                    attrs: {
                        id: 'message',
                        label: 'Message',
                        placeholder: 'Tell us more about your inquiry...',
                        required: true
                    }
                }
            ]
        }),
        settings: {
            theme: 'default',
            emailNotifications: true,
            submitButtonText: 'Send Message',
            thankYouMessage: 'Thank you for contacting us! We\'ll get back to you soon.'
        }
    },
    {
        id: 'feedback-survey',
        title: 'Feedback Survey',
        description: 'Collect customer feedback.',
        icon: 'BarChart2',
        content: JSON.stringify({
            type: 'doc',
            content: [
                {
                    type: 'heading',
                    attrs: { level: 1 },
                    content: [{ type: 'text', text: 'Customer Feedback Survey' }]
                },
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Your feedback helps us improve our products and services. Please take a moment to share your thoughts.' }]
                },
                {
                    type: 'formShortText',
                    attrs: {
                        id: 'name',
                        label: 'Your Name',
                        placeholder: 'Jane Smith',
                        required: false
                    }
                },
                {
                    type: 'formEmail',
                    attrs: {
                        id: 'email',
                        label: 'Email (optional)',
                        placeholder: 'jane@example.com',
                        required: false
                    }
                },
                {
                    type: 'formMultipleChoice',
                    attrs: {
                        id: 'satisfaction',
                        label: 'How satisfied are you with our product/service?',
                        options: ['Very Satisfied', 'Satisfied', 'Neutral', 'Dissatisfied', 'Very Dissatisfied'],
                        required: true,
                        type: 'radio'
                    }
                },
                {
                    type: 'formMultipleChoice',
                    attrs: {
                        id: 'rating',
                        label: 'How likely are you to recommend us to a friend?',
                        options: ['10 - Extremely Likely', '9', '8', '7', '6', '5', '4', '3', '2', '1', '0 - Not Likely'],
                        required: true,
                        type: 'radio'
                    }
                },
                {
                    type: 'formCheckbox',
                    attrs: {
                        id: 'improvements',
                        label: 'What areas could we improve? (Select all that apply)',
                        options: ['Product Quality', 'Customer Service', 'Pricing', 'Website/App Experience', 'Delivery/Shipping'],
                        required: false
                    }
                },
                {
                    type: 'formLongText',
                    attrs: {
                        id: 'comments',
                        label: 'Additional Comments',
                        placeholder: 'Share any additional thoughts or suggestions...',
                        required: false
                    }
                }
            ]
        }),
        settings: {
            theme: 'default',
            emailNotifications: true,
            submitButtonText: 'Submit Feedback',
            thankYouMessage: 'Thank you for your valuable feedback!'
        }
    },
    {
        id: 'event-registration',
        title: 'Event Registration',
        description: 'Register attendees for events.',
        icon: 'FileText',
        content: JSON.stringify({
            type: 'doc',
            content: [
                {
                    type: 'heading',
                    attrs: { level: 1 },
                    content: [{ type: 'text', text: 'Event Registration' }]
                },
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Please complete this form to register for our upcoming event. We look forward to seeing you there!' }]
                },
                {
                    type: 'formShortText',
                    attrs: {
                        id: 'first-name',
                        label: 'First Name',
                        placeholder: 'John',
                        required: true
                    }
                },
                {
                    type: 'formShortText',
                    attrs: {
                        id: 'last-name',
                        label: 'Last Name',
                        placeholder: 'Doe',
                        required: true
                    }
                },
                {
                    type: 'formEmail',
                    attrs: {
                        id: 'email',
                        label: 'Email Address',
                        placeholder: 'john@example.com',
                        required: true
                    }
                },
                {
                    type: 'formPhone',
                    attrs: {
                        id: 'phone',
                        label: 'Phone Number',
                        placeholder: '+1 (555) 000-0000',
                        required: true
                    }
                },
                {
                    type: 'formShortText',
                    attrs: {
                        id: 'company',
                        label: 'Company/Organization',
                        placeholder: 'Acme Inc.',
                        required: false
                    }
                },
                {
                    type: 'formDropdown',
                    attrs: {
                        id: 'ticket-type',
                        label: 'Ticket Type',
                        options: ['General Admission', 'VIP', 'Student', 'Group (5+)'],
                        required: true
                    }
                },
                {
                    type: 'formMultipleChoice',
                    attrs: {
                        id: 'dietary',
                        label: 'Dietary Restrictions',
                        options: ['None', 'Vegetarian', 'Vegan', 'Gluten-Free', 'Other'],
                        required: false,
                        type: 'radio'
                    }
                },
                {
                    type: 'formLongText',
                    attrs: {
                        id: 'special-requests',
                        label: 'Special Requests or Accommodations',
                        placeholder: 'Let us know if you have any special needs...',
                        required: false
                    }
                }
            ]
        }),
        settings: {
            theme: 'default',
            emailNotifications: true,
            submitButtonText: 'Complete Registration',
            thankYouMessage: 'Registration successful! Check your email for confirmation details.'
        }
    }
];

export function getTemplateById(id: string): FormTemplate | undefined {
    return FORM_TEMPLATES.find(template => template.id === id);
}
