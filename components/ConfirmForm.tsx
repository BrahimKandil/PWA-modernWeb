"use client";
import { FormHTMLAttributes } from "react";

// Rien n'est écrit avant un « oui » explicite : la fenêtre native suffit, l'écriture reste
// un simple POST de formulaire (le pattern du projet, sans JS pour les mutations).
export default function ConfirmForm({ message, children, ...reste }: FormHTMLAttributes<HTMLFormElement> & { message: string }) {
  return (
    <form {...reste} onSubmit={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {children}
    </form>
  );
}
