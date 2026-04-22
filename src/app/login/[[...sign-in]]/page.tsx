import Image from 'next/image';
import { SignIn } from '@clerk/nextjs';

export default function LoginPage() {
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
          <p className="text-muted-foreground">Sign in to your GoodGuys dashboard</p>
        </div>
        <SignIn
          appearance={{
            elements: {
              rootBox: 'mx-auto',
              card: 'shadow-none',
            },
          }}
        />
      </div>
    </div>
  );
}
