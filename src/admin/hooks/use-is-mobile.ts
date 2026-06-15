import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';

function getInitialIsMobile(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(MOBILE_QUERY).matches;
}

export function useIsMobile(): boolean {
    const [isMobile, setIsMobile] = useState<boolean>(getInitialIsMobile);

    useEffect(() => {
        const mql = window.matchMedia(MOBILE_QUERY);
        function handleChange(e: MediaQueryListEvent) {
            setIsMobile(e.matches);
        }
        mql.addEventListener('change', handleChange);
        return () => {
            mql.removeEventListener('change', handleChange);
        };
    }, []);

    return isMobile;
}
