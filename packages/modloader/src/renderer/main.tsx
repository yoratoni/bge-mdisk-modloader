import App from "@renderer/App"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

// Styles
import "@renderer/styles/globals.css"

const root = document.getElementById("root")
if (!root) throw new Error("Root element #root not found in index.html.")

createRoot(root).render(
    <StrictMode>
        <App />
    </StrictMode>,
)
