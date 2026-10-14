// React necesita un punto inicial para dibujar la app.
// Aca buscamos el elemento root del HTML y dentro de el montamos App.
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
