import { useContext } from 'react';
import { Ctx } from './shared.js';

export const useStore = () => useContext(Ctx);
