import { mountApp } from '../../components/mount';
import Demo from './DemoApp';

mountApp(document.getElementById('root')!, <Demo />, import.meta.hot);
