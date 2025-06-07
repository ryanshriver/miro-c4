'use client';

import React, { useState } from 'react';
import { C4Exporter } from '../components/C4Exporter';
import '../assets/style.css';

export default function Page() {
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const handleWarnings = (newWarnings: string[]) => {
    console.log('Page received warnings:', newWarnings);
    setWarnings(newWarnings);
  };

  const handleErrors = (newErrors: string[]) => {
    console.log('Page received errors:', newErrors);
    setErrors(newErrors);
  };

  return (
    <div style={{ padding: '10px', width: '100%' }}>
      <div style={{ margin: '0 auto', textAlign: 'left', width: '100%' }}>
        <h1 style={{ 
          fontSize: '42px', 
          marginBottom: '40px',
          lineHeight: '1.2',
          fontWeight: 'normal'
        }}>
          C4.ai
        </h1>
        <p style={{ 
          fontSize: '20px', 
          lineHeight: '1.5', 
          marginBottom: '20px',
          color: '#333333'
        }}>
          1. Choose a diagram and export<br/>
          2. Copy+paste into GenAI<br/>
          3. Modernize by Prompt<br/>
        </p>
        {warnings.length > 0 && (
          <div style={{ 
            marginBottom: '20px',
            padding: '12px',
            backgroundColor: '#fff0f0',
            border: '1px solid #ffcdd2',
            borderRadius: '4px'
          }}>
            <h2 style={{ fontWeight: 'bold', marginBottom: '8px' }}>Warnings:</h2>
            <ul style={{ listStyleType: 'disc', paddingLeft: '20px' }}>
              {warnings.map((warning, index) => (
                <li key={index} style={{ marginBottom: index < warnings.length - 1 ? '8px' : 0 }}>
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        )}
        {errors.length > 0 && (
          <div style={{ 
            marginBottom: '20px',
            padding: '12px',
            backgroundColor: '#fff0f0',
            border: '1px solid #ffcdd2',
            borderRadius: '4px'
          }}>
            <h2 style={{ fontWeight: 'bold', marginBottom: '8px' }}>Errors:</h2>
            <ul style={{ listStyleType: 'disc', paddingLeft: '20px' }}>
              {errors.map((error, index) => (
                <li key={index} style={{ marginBottom: index < errors.length - 1 ? '8px' : 0 }}>
                  {error}
                </li>
              ))}
            </ul>
          </div>
        )}
        <C4Exporter onWarnings={handleWarnings} onErrors={handleErrors} />
      </div>
    </div>
  );
}
