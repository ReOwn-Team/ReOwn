import { API_ENABLED } from '../api/client.js';
import MockStore from './MockStore.jsx';
import ApiStore from './ApiStore.jsx';

export function StoreProvider({ children }) {
  return API_ENABLED ? <ApiStore>{children}</ApiStore> : <MockStore>{children}</MockStore>;
}
