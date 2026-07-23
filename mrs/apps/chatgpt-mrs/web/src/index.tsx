import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const root = document.getElementById("mrs-viewport-root");
if (root) {
  createRoot(root).render(<App />);
}

export default App;
