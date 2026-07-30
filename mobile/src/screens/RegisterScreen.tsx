import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  KeyboardAvoidingView, 
  Platform,
  Animated,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function RegisterScreen({ navigation }: any) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'consumer' | 'restaurant'>('consumer');
  const [error, setError] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(0);
  
  const { register, isLoading } = useAuth();

  const nameAnim = useRef(new Animated.Value(0)).current;
  const emailAnim = useRef(new Animated.Value(0)).current;
  const passwordAnim = useRef(new Animated.Value(0)).current;
  const confirmPasswordAnim = useRef(new Animated.Value(0)).current;

  const handleFocus = (anim: Animated.Value) => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const handleBlur = (anim: Animated.Value) => {
    Animated.timing(anim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  useEffect(() => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    setPasswordStrength(strength);
  }, [password]);

  const handleRegister = async () => {
    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (passwordStrength < 5) {
      setError('Password does not meet all requirements');
      return;
    }

    setError('');
    try {
      await register(email, password, name, role);
    } catch (err: any) {
      setError(err.message || 'Failed to register');
    }
  };

  const getInputStyle = (anim: Animated.Value) => ({
    borderColor: anim.interpolate({
      inputRange: [0, 1],
      outputRange: ['#333', '#FF8C00']
    }),
    shadowColor: '#FF8C00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: anim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 0.5]
    }),
    shadowRadius: 5,
    elevation: anim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 5]
    })
  });

  const getStrengthColor = () => {
    if (passwordStrength <= 2) return '#ff4444';
    if (passwordStrength <= 4) return '#ffbb33';
    return '#00C851';
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join Save Plate today!</Text>
          </View>

          <View style={styles.form}>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            
            <View style={styles.roleContainer}>
              <TouchableOpacity 
                style={[styles.roleButton, role === 'consumer' && styles.roleButtonActive]}
                onPress={() => setRole('consumer')}
              >
                <Text style={[styles.roleText, role === 'consumer' && styles.roleTextActive]}>Consumer</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.roleButton, role === 'restaurant' && styles.roleButtonActive]}
                onPress={() => setRole('restaurant')}
              >
                <Text style={[styles.roleText, role === 'restaurant' && styles.roleTextActive]}>Restaurant</Text>
              </TouchableOpacity>
            </View>

            <Animated.View style={[styles.inputContainer, getInputStyle(nameAnim)]}>
              <TextInput
                style={styles.input}
                placeholder="Full Name"
                placeholderTextColor="#888"
                value={name}
                onChangeText={setName}
                onFocus={() => handleFocus(nameAnim)}
                onBlur={() => handleBlur(nameAnim)}
              />
            </Animated.View>

            <Animated.View style={[styles.inputContainer, getInputStyle(emailAnim)]}>
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#888"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                onFocus={() => handleFocus(emailAnim)}
                onBlur={() => handleBlur(emailAnim)}
              />
            </Animated.View>

            <Animated.View style={[styles.inputContainer, getInputStyle(passwordAnim)]}>
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#888"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                onFocus={() => handleFocus(passwordAnim)}
                onBlur={() => handleBlur(passwordAnim)}
              />
            </Animated.View>
            
            <View style={styles.passwordRequirements}>
              <View style={styles.strengthBarContainer}>
                <View style={[styles.strengthBar, { width: `${(passwordStrength / 5) * 100}%`, backgroundColor: getStrengthColor() }]} />
              </View>
              <Text style={styles.requirementText}>• 8+ characters</Text>
              <Text style={styles.requirementText}>• Uppercase & lowercase letters</Text>
              <Text style={styles.requirementText}>• Numbers & special characters</Text>
            </View>

            <Animated.View style={[styles.inputContainer, getInputStyle(confirmPasswordAnim)]}>
              <TextInput
                style={styles.input}
                placeholder="Confirm Password"
                placeholderTextColor="#888"
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onFocus={() => handleFocus(confirmPasswordAnim)}
                onBlur={() => handleBlur(confirmPasswordAnim)}
              />
            </Animated.View>

            <TouchableOpacity 
              style={styles.button} 
              onPress={handleRegister}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#1a1a2e" />
              ) : (
                <Text style={styles.buttonText}>Register</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.linkText}>
                Already have an account? <Text style={styles.linkTextBold}>Login</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#aaa',
  },
  form: {
    width: '100%',
  },
  errorText: {
    color: '#ff4444',
    marginBottom: 16,
    textAlign: 'center',
  },
  roleContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 4,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  roleButtonActive: {
    backgroundColor: '#FF8C00',
  },
  roleText: {
    color: '#888',
    fontWeight: 'bold',
    fontSize: 16,
  },
  roleTextActive: {
    color: '#1a1a2e',
  },
  inputContainer: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  input: {
    color: '#fff',
    padding: 16,
    fontSize: 16,
  },
  passwordRequirements: {
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  strengthBarContainer: {
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    marginBottom: 8,
  },
  strengthBar: {
    height: '100%',
    borderRadius: 2,
  },
  requirementText: {
    color: '#aaa',
    fontSize: 12,
    marginBottom: 2,
  },
  button: {
    backgroundColor: '#FF8C00',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  buttonText: {
    color: '#1a1a2e',
    fontSize: 18,
    fontWeight: 'bold',
  },
  linkText: {
    color: '#aaa',
    textAlign: 'center',
    fontSize: 14,
  },
  linkTextBold: {
    color: '#FF8C00',
    fontWeight: 'bold',
  },
});
