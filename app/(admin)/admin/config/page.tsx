import { redirect } from "next/navigation";

// La sección de config tiene un único apartado por ahora: redirige a Prompt.
export default function ConfigIndexPage() {
  redirect("/admin/config/prompt");
}
