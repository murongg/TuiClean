import { mountApp } from '../../components/mount';
import ExtensionPopup from './ExtensionPopupApp';

mountApp(document.getElementById('root')!, <ExtensionPopup />, import.meta.hot);
