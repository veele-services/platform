"use client";
import {createContext,useContext} from 'react';
export const SourcePortalContext=createContext(false);
export const useSourcePortal=()=>useContext(SourcePortalContext);
