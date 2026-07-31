import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, Platform, KeyboardAvoidingView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';

export default function RestaurantScanner() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [manualOtp, setManualOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{ success: boolean; co2Saved: number } | null>(null);
  const { authenticatedFetch, logout } = useAuth();

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  const verifyOtp = async (otpCode: string) => {
    if (isVerifying) return;
    setIsVerifying(true);
    try {
      const response = await authenticatedFetch(`${API_URL}/api/v1/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ otpCode })
      });
      const data = await response.json();
      if (response.ok) {
        setVerificationResult({ success: true, co2Saved: data.co2Saved || 0 });
      } else {
        Alert.alert('Verification Failed', data.message || 'Invalid OTP');
        setScanned(false);
      }
    } catch (err) {
      Alert.alert('Error', 'Network error');
      setScanned(false);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    let otp = data;
    if (data.startsWith('claim:')) {
      const parts = data.split(':');
      otp = parts[3] || data;
    } else {
      try { const p = JSON.parse(data); if (p.otp) otp = p.otp; } catch {}
    }
    verifyOtp(otp);
  };

  const handleManualVerify = () => {
    if (manualOtp.length === 6) {
      setScanned(true);
      verifyOtp(manualOtp);
    } else {
      Alert.alert('Invalid', 'Enter 6 digit OTP');
    }
  };

  const reset = () => {
    setScanned(false);
    setManualOtp('');
    setVerificationResult(null);
  };

  if (!permission) return <View style={styles.container} />;
  if (!permission.granted) return (
    <View style={styles.container}>
      <Text style={[styles.centerText, {color: '#fff'}]}>No access to camera</Text>
      <TouchableOpacity style={styles.button} onPress={requestPermission}>
        <Text style={styles.buttonText}>Grant Permission</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📸 Scan Pickup</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
      
      {verificationResult ? (
        <View style={styles.resultContainer}>
          <View style={styles.successCircle}>
            <Text style={styles.checkmark}>✓</Text>
          </View>
          <Text style={styles.resultTitle}>Pickup Verified!</Text>
          <Text style={styles.co2Text}>{verificationResult.co2Saved}kg CO2 Saved</Text>
          <TouchableOpacity style={styles.button} onPress={reset}>
            <Text style={styles.buttonText}>Scan Next</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <CameraView
            style={styles.camera}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          >
            <View style={styles.overlay}>
              <View style={styles.scanFrame} />
              <Text style={styles.scanText}>Position QR Code within frame</Text>
            </View>
          </CameraView>
          <View style={styles.bottomSection}>
            <Text style={styles.manualText}>Or enter OTP manually:</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={manualOtp}
                onChangeText={setManualOtp}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="123456"
                placeholderTextColor="#888"
              />
              <TouchableOpacity style={styles.verifyBtn} onPress={handleManualVerify} disabled={isVerifying}>
                <Text style={styles.verifyBtnText}>{isVerifying ? 'Verifying' : 'Verify'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: { 
    height: 90, 
    backgroundColor: '#1a1a2e', 
    flexDirection: 'row',
    justifyContent: 'space-between', 
    alignItems: 'flex-end', 
    paddingBottom: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#FF8C00'
  },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  logoutButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#16213e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF8C00'
  },
  logoutText: { color: '#FF8C00', fontSize: 14, fontWeight: 'bold' },
  camera: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(26,26,46,0.6)', justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: 250, height: 250, borderWidth: 2, borderColor: '#FF8C00', backgroundColor: 'transparent', borderRadius: 16 },
  scanText: { color: '#fff', marginTop: 20, fontSize: 16 },
  bottomSection: { padding: 24, backgroundColor: '#16213e', borderTopWidth: 1, borderTopColor: '#333' },
  manualText: { fontSize: 16, color: '#aaa', marginBottom: 12 },
  inputRow: { flexDirection: 'row', gap: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: '#333', backgroundColor: '#1a1a2e', borderRadius: 12, padding: 16, fontSize: 20, letterSpacing: 4, color: '#FF8C00', fontWeight: 'bold', textAlign: 'center' },
  verifyBtn: { backgroundColor: '#FF8C00', justifyContent: 'center', paddingHorizontal: 24, borderRadius: 12 },
  verifyBtnText: { color: '#1a1a2e', fontWeight: 'bold', fontSize: 16 },
  resultContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  successCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(0,200,81,0.2)', borderWidth: 4, borderColor: '#00C851', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  checkmark: { color: '#00C851', fontSize: 60 },
  resultTitle: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
  co2Text: { fontSize: 20, color: '#00C851', marginBottom: 40, fontWeight: 'bold' },
  button: { backgroundColor: '#FF8C00', paddingHorizontal: 30, paddingVertical: 16, borderRadius: 12, width: '100%', alignItems: 'center' },
  buttonText: { color: '#1a1a2e', fontWeight: 'bold', fontSize: 18 },
  centerText: { textAlign: 'center', margin: 20, fontSize: 18 }
});
