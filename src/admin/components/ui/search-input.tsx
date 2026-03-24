import React from 'react';
import { Search } from 'lucide-react';

export function SearchInput(props: React.ComponentProps<'input'>): React.ReactElement {
    return (
        <div className="am-search__wrap">
            <Search size={14} className="am-search__icon" aria-hidden="true" />
            <input className="am-search" type="search" {...props} />
        </div>
    );
}
