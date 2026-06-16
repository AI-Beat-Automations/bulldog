"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { activateVersion, saveNewActiveVersion } from "@/lib/prompt/repository";

const CONFIG_PATH = "/admin/config";

// Los server actions son endpoints POST invocables por sí solos: cada uno
// re-verifica la sesión, no basta el guard de la página/layout.

export async function savePrompt(formData: FormData) {
  const session = await auth();
  if (!session) redirect("/login");

  const body = (formData.get("body") ?? "").toString();
  if (body.trim().length === 0) {
    redirect(`${CONFIG_PATH}?status=empty`);
  }

  const { created } = await saveNewActiveVersion(body);
  revalidatePath(CONFIG_PATH);
  redirect(`${CONFIG_PATH}?status=${created ? "saved" : "nochange"}`);
}

export async function activatePrompt(formData: FormData) {
  const session = await auth();
  if (!session) redirect("/login");

  const id = (formData.get("id") ?? "").toString();
  if (id.length > 0) {
    await activateVersion(id);
    revalidatePath(CONFIG_PATH);
  }
  redirect(`${CONFIG_PATH}?status=activated`);
}
