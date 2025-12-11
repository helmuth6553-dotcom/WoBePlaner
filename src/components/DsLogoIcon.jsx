import React from 'react';

const DsLogoIcon = ({ className = "w-6 h-6", ...props }) => {
    return (
        <img
            src="/logo2.png"
            alt="DS Logo"
            className={`${className} object-contain`}
            {...props}
        />
    );
};

export default DsLogoIcon;
