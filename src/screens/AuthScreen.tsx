import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { colors, font, radii } from '../theme';
import { useAuthStore } from '../store/useAuthStore';

// Web: an invite link (vpn.royalmancloud.com/?ref=CODE) opens sign-up with the code filled in.
function refFromUrl(): string {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return '';
  try { return new URLSearchParams(window.location.search).get('ref')?.toUpperCase().slice(0, 12) || ''; } catch { return ''; }
}

export default function AuthScreen() {
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const [refCode, setRefCode] = useState(refFromUrl);
  const [mode, setMode] = useState<'signIn' | 'signUp'>(refCode ? 'signUp' : 'signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignUp = mode === 'signUp';

  async function submit() {
    if (busy) return;
    setError(null);
    if (!email.trim() || !password) return setError('Enter your email and password.');
    if (isSignUp && password.length < 8) return setError('Use a password of at least 8 characters.');
    setBusy(true);
    try {
      await (isSignUp ? signUp(email.trim(), password, refCode.trim()) : signIn(email.trim(), password));
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.logo}>
            <FontAwesome6 name="shield-halved" size={30} color={colors.orange} />
          </View>
          <Text style={styles.brandName}>ROYAL-VPN</Text>
          <Text style={styles.tagline}>{isSignUp ? 'Create your account — your first 3 days of Pro are free' : 'Welcome back. Sign in to connect'}</Text>
        </View>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          editable={!busy}
          onSubmitEditing={submit}
        />

        <Text style={styles.label}>Password</Text>
        <View style={styles.passwordWrap}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0, borderWidth: 0 }]}
            value={password}
            onChangeText={setPassword}
            placeholder={isSignUp ? 'At least 8 characters' : 'Your password'}
            placeholderTextColor={colors.textFaint}
            secureTextEntry={!showPassword}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            textContentType={isSignUp ? 'newPassword' : 'password'}
            editable={!busy}
            onSubmitEditing={submit}
          />
          <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10} style={styles.eye} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
            <FontAwesome6 name={showPassword ? 'eye-slash' : 'eye'} size={15} color={colors.textMuted} />
          </Pressable>
        </View>

        {isSignUp && (
          <>
            <Text style={styles.label}>Invite code (optional)</Text>
            <TextInput
              style={styles.input}
              value={refCode}
              onChangeText={(v) => setRefCode(v.toUpperCase())}
              placeholder="From a friend — you both get free days"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              editable={!busy}
            />
          </>
        )}

        {error && (
          <View style={styles.errorBox}>
            <FontAwesome6 name="circle-exclamation" size={13} color={colors.red} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable style={[styles.primary, busy && { opacity: 0.7 }]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryText}>{isSignUp ? 'Create account' : 'Sign in'}</Text>}
        </Pressable>

        <Pressable onPress={() => { setMode(isSignUp ? 'signIn' : 'signUp'); setError(null); }} disabled={busy} style={styles.switch}>
          <Text style={styles.switchText}>
            {isSignUp ? 'Already have an account? ' : 'New to Royal-VPN? '}
            <Text style={styles.switchLink}>{isSignUp ? 'Sign in' : 'Create an account'}</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40, width: '100%', maxWidth: 440, alignSelf: 'center' },
  brand: { alignItems: 'center', marginBottom: 34 },
  logo: { width: 68, height: 68, borderRadius: 9999, backgroundColor: 'rgba(255,147,0,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  brandName: { fontFamily: font.extraBold, fontSize: 24, color: colors.textPrimary, letterSpacing: 0.5 },
  tagline: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginTop: 6, textAlign: 'center' },
  label: { fontFamily: font.medium, fontSize: 12, color: colors.textSecondary, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface, borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 13,
    fontFamily: font.regular, fontSize: 14, color: colors.textPrimary, marginBottom: 16, borderWidth: 1, borderColor: 'transparent',
  },
  passwordWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.md, marginBottom: 16 },
  eye: { paddingHorizontal: 14 },
  errorBox: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: radii.md, padding: 12, marginBottom: 16 },
  errorText: { flex: 1, fontFamily: font.regular, fontSize: 13, color: '#FCA5A5' },
  primary: { backgroundColor: colors.orange, borderRadius: 9999, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  primaryText: { fontFamily: font.bold, fontSize: 15, color: '#000' },
  switch: { alignItems: 'center', marginTop: 20, paddingVertical: 6 },
  switchText: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  switchLink: { fontFamily: font.semiBold, color: colors.orange },
});
