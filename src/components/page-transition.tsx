'use client';

import { motion } from 'framer-motion';

export const PageTransition = ({ children, className }: { children: React.ReactNode, className?: string }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20, filter: 'blur(5px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className={className}
        >
            {children}
        </motion.div>
    );
};
