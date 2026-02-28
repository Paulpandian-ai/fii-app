import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
  CognitoUserAttribute,
} from 'amazon-cognito-identity-js';

let _userPool: CognitoUserPool | null = null;

function getUserPool(): CognitoUserPool | null {
  if (_userPool) return _userPool;
  const poolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  if (!poolId || !clientId) return null;
  _userPool = new CognitoUserPool({ UserPoolId: poolId, ClientId: clientId });
  return _userPool;
}

export interface AuthTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
}

export const signUp = (
  email: string,
  password: string,
  name: string,
): Promise<CognitoUser> => {
  return new Promise((resolve, reject) => {
    const pool = getUserPool();
    if (!pool) { reject(new Error('Cognito not configured')); return; }
    const attributes = [
      new CognitoUserAttribute({ Name: 'email', Value: email }),
      new CognitoUserAttribute({ Name: 'name', Value: name }),
    ];
    pool.signUp(email, password, attributes, [], (err, result) => {
      if (err) { reject(err); return; }
      resolve(result!.user);
    });
  });
};

export const confirmSignUp = (email: string, code: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const pool = getUserPool();
    if (!pool) { reject(new Error('Cognito not configured')); return; }
    const user = new CognitoUser({ Username: email, Pool: pool });
    user.confirmRegistration(code, true, (err) => {
      if (err) { reject(err); return; }
      resolve();
    });
  });
};

export const signIn = (email: string, password: string): Promise<AuthTokens> => {
  return new Promise((resolve, reject) => {
    const pool = getUserPool();
    if (!pool) { reject(new Error('Cognito not configured')); return; }
    const user = new CognitoUser({ Username: email, Pool: pool });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });
    user.authenticateUser(authDetails, {
      onSuccess: (session: CognitoUserSession) => {
        resolve({
          idToken: session.getIdToken().getJwtToken(),
          accessToken: session.getAccessToken().getJwtToken(),
          refreshToken: session.getRefreshToken().getToken(),
        });
      },
      onFailure: (err) => reject(err),
    });
  });
};

export const signOut = (): void => {
  const pool = getUserPool();
  if (!pool) return;
  const user = pool.getCurrentUser();
  if (user) user.signOut();
};

export const getCurrentSession = (): Promise<AuthTokens | null> => {
  return new Promise((resolve) => {
    const pool = getUserPool();
    if (!pool) { resolve(null); return; }
    const user = pool.getCurrentUser();
    if (!user) { resolve(null); return; }
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) { resolve(null); return; }
      resolve({
        idToken: session.getIdToken().getJwtToken(),
        accessToken: session.getAccessToken().getJwtToken(),
        refreshToken: session.getRefreshToken().getToken(),
      });
    });
  });
};

export const getCurrentUserEmail = (): Promise<string | null> => {
  return new Promise((resolve) => {
    const pool = getUserPool();
    if (!pool) { resolve(null); return; }
    const user = pool.getCurrentUser();
    if (!user) { resolve(null); return; }
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session) { resolve(null); return; }
      user.getUserAttributes((attrErr, attributes) => {
        if (attrErr || !attributes) { resolve(null); return; }
        const email = attributes.find((a) => a.Name === 'email');
        resolve(email?.Value || null);
      });
    });
  });
};
