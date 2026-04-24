import { PasswordCredentialsSchema } from "@bharatdoc/shared";
import { errorResponse, AppError } from "@/lib/server/errors";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export async function POST(request: Request) {
  try {
    const credentials = PasswordCredentialsSchema.parse(await request.json());
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.admin.createUser({
      email: credentials.email,
      password: credentials.password,
      email_confirm: true,
      user_metadata: {
        email: credentials.email
      }
    });

    if (error) {
      const isDuplicate = /already|registered|exists/i.test(error.message);
      throw new AppError(isDuplicate ? 409 : 400, isDuplicate ? "Email is already registered." : error.message, "AUTH_SIGNUP_FAILED");
    }

    return Response.json({ email: credentials.email });
  } catch (error) {
    return errorResponse(error);
  }
}
