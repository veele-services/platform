import React from 'react';
import {createRoot} from 'react-dom/client';
import './app/globals.css';
import './components/fieldgrid/backoffice-portal.css';
import './components/fieldgrid/shell-chrome.css';
import './app/dashboard-system.css';
import App from './App';
import './prototype.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
