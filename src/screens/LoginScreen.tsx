import NetInfo from '@react-native-community/netinfo';
import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import {CAdminApi} from '../api/cadminApi';
import {CAdminNative} from '../native/CAdminNative';
import {useSession} from '../state/SessionContext';
import {colors} from '../theme/colors';
import {strings} from '../theme/strings';
import {errorMessage} from '../utils/errors';

export function LoginScreen() {
  const session = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    CAdminNative.requestRequiredPermissions().catch(() => undefined);
  }, []);

  async function signIn() {
    const name = username.trim();
    const pwd = password.trim();
    if (name.length < 4 || name.length > 50) {
      Alert.alert('', 'Username must be 4-50 characters.');
      return;
    }
    if (pwd.length < 4 || pwd.length > 20) {
      Alert.alert('', 'Password must be 4-20 characters.');
      return;
    }

    const network = await NetInfo.fetch();
    if (!network.isConnected) {
      Alert.alert('', strings.loginNetworkUnavailable);
      return;
    }

    setLoading(true);
    setLoginError('');
    try {
      const result = await CAdminApi.signIn(name, pwd);
      const token = result.data?.token ?? '';
      const expiry = result.data?.token_expiry_times ?? Date.now() + 24 * 60 * 60 * 1000;
      if (!token) {
        throw new Error('Login did not return a token.');
      }
      await session.signInLocal(token, expiry);
    } catch (error) {
      const message = errorMessage(error);
      setLoginError(message);
      Alert.alert('', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ImageBackground source={require('../assets/bglogin.png')} style={styles.hero} resizeMode="cover">
        <Text style={styles.welcome}>{strings.hello}</Text>
        <Text style={styles.signInTitle}>Sign In</Text>
      </ImageBackground>

      <View style={styles.field}>
        <Image source={require('../assets/username.png')} style={styles.icon} />
        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          placeholder="Input your username"
          placeholderTextColor="#d0d0d0"
          style={styles.input}
          maxLength={50}
        />
      </View>

      <View style={styles.field}>
        <Image source={require('../assets/verification.png')} style={styles.icon} />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Input your password"
          placeholderTextColor="#d0d0d0"
          style={styles.input}
          secureTextEntry={!showPassword}
          maxLength={20}
        />
        <Pressable onPress={() => setShowPassword(value => !value)} hitSlop={10}>
          <Image source={showPassword ? require('../assets/eye.png') : require('../assets/eye_close.png')} style={styles.eye} />
        </Pressable>
      </View>

      <Pressable disabled={loading} onPress={signIn} style={styles.loginButton}>
        {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.loginText}>LET'S GO</Text>}
      </Pressable>

      {!!loginError && <Text style={styles.loginError}>{loginError}</Text>}

      <Text style={styles.powered}>Powered by</Text>
      <Image source={require('../assets/logo_bottom.png')} style={styles.logoBottom} resizeMode="contain" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.white
  },
  content: {
    alignItems: 'center',
    paddingBottom: 28
  },
  hero: {
    width: '100%',
    height: 260,
    alignItems: 'center',
    justifyContent: 'center'
  },
  welcome: {
    color: colors.white,
    fontSize: 30
  },
  signInTitle: {
    position: 'absolute',
    bottom: 20,
    color: colors.white,
    fontSize: 20
  },
  field: {
    width: '68%',
    minHeight: 50,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#999'
  },
  icon: {
    width: 18,
    height: 18,
    resizeMode: 'contain',
    marginRight: 12
  },
  input: {
    flex: 1,
    color: '#666',
    fontSize: 14
  },
  eye: {
    width: 20,
    height: 20,
    resizeMode: 'contain'
  },
  loginButton: {
    width: 269,
    height: 43,
    marginTop: 18,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green
  },
  loginText: {
    color: colors.white,
    fontSize: 14
  },
  loginError: {
    width: '78%',
    marginTop: 14,
    color: colors.error,
    textAlign: 'center',
    fontSize: 13
  },
  powered: {
    marginTop: 35,
    color: colors.muted,
    fontSize: 24
  },
  logoBottom: {
    marginTop: 6,
    maxWidth: 180,
    height: 52
  }
});
