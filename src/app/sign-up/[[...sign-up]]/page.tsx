import Image from 'next/image';
import { SignUp } from '@clerk/nextjs';

// Where Clerk invitations land — the SignUp component reads the invitation ticket
// from the URL and lets the crew member set a password for their invited email.
export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mb-6 flex justify-center">
            <Image
              src="/brand/gg-mark.png"
              alt="GoodGuys"
              width={3488}
              height={3566}
              priority
              sizes="96px"
              className="h-24 w-24"
            />
          </div>
          <p className="text-muted-foreground">Set up your GoodGuys crew account</p>
        </div>
        <SignUp
          signInUrl="/login"
          forceRedirectUrl="/dashboard"
          appearance={{ elements: { rootBox: 'mx-auto', card: 'shadow-none' } }}
        />
      </div>
    </div>
  );
}
