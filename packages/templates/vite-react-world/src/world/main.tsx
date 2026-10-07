import { createRoot } from "react-dom/client";
import { World } from "./World.tsx";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing world root.");
createRoot(root).render(<World />);
