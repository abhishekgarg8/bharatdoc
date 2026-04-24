import { PasswordCredentialsSchema, usernameToAuthEmail } from "@bharatdoc/shared";
import { errorResponse, AppError } from "@/lib/server/errors";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export async function POST(request: Request) {
  try {
    const credentials = PasswordCredentialsSchema.parse(await request.json());
    const email = usernameToAuthEmail(credentials.username);
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.admin.createUser({
      email,
      password: credentials.password,
      email_confirm: true,
      user_metadata: {
        username: credentials.username
      }
    });

    if (error) {
      const isDuplicate = /already|registered|exists/i.test(error.message);
      throw new AppError(isDuplicate ? 409 : 400, isDuplicate ? "Username is already taken." : error.message, "AUTH_SIGNUP_FAILED");
    }

    return Response.json({ username: credentials.username });
  } catch (error) {
    return errorResponse(error);
  }
}
