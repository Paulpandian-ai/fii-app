import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
  CognitoUserAttribute,
} from 'amazon-cognito-identity-js';

// These will be populated from environment config
const COGNITO_CONFIG = {
  UserPoolId: process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID || '',
  ClientId: process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID || '',
};

const userPool = new CognitoUserPool(COGNITO_CONFIG);

export interface AuthTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
}

// ─── Email/Password Auth ───

export const signUp = (
  email: string,
  password: string,
  name: string
): Promise<CognitoUser> => {
  return new Promise((resolve, reject) => {
    const attributes = [
      new CognitoUserAttribute({ Name: 'email', Value: email }),
      new CognitoUserAttribute({ Name: 'name', Value: name }),
    ];

    userPool.signUp(email, password, attributes, [], (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result!.user);
    });
  });
};

export const signIn = (
  email: string,
  password: string
): Promise<AuthTokens> => {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    user.authenticateUser(authDetails, {
      onSuccess: (session: CognitoUserSession) => {
        resolve({
          idToken: session.getIdToken().getJwtToken(),
          accessToken: session.getAccessToken().getJwtToken(),
          refreshToken: session.getRefreshToken().getToken(),
        });
      },
      onFailure: (err) => {
        reject(err);
      },
    });
  });
};

export const signOut = (): void => {
  const user = userPool.getCurrentUser();
  if (user) {
    user.signOut();
  }
};

export const getCurrentSession = (): Promise<AuthTokens | null> => {
  return new Promise((resolve) => {
    const user = userPool.getCurrentUser();
    if (!user) {
      resolve(null);
      return;
    }

    user.getSession(
      (err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session || !session.isValid()) {
          resolve(null);
          return;
        }

        resolve({
          idToken: session.getIdToken().getJwtToken(),
          accessToken: session.getAccessToken().getJwtToken(),
          refreshToken: session.getRefreshToken().getToken(),
        });
      }
    );
  });
};

export const confirmSignUp = (
  email: string,
  code: string
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    user.confirmRegistration(code, true, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
};

// ─── Federated Auth (Google / Apple) ───
// Google and Apple sign-in are handled via Expo AuthSession
// and federated identity federation with the Cognito User Pool.
// The actual OAuth flow is triggered from the UI layer using
// expo-auth-session and expo-web-browser, then tokens are
// exchanged with Cognito.

export const GOOGLE_AUTH_CONFIG = {
  expoClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '',
  scopes: ['openid', 'profile', 'email'],
};

export const APPLE_AUTH_CONFIG = {
  scopes: ['email', 'name'],
};
