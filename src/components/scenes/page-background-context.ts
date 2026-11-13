import { createContext, useContext } from "react";

export const PageBackgroundContext = createContext("ivory");
export function usePageBackground() { return useContext(PageBackgroundContext); }