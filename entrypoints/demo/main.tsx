import { mountApp } from '../../components/mount';
import DemoPage from './DemoPage';

mountApp(document.getElementById('root')!, <DemoPage />, import.meta.hot);
