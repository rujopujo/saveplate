import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, 
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform 
} from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';
import RestaurantScanner from './RestaurantScanner';

interface SurplusItem {
  id: string;
  name: string;
  quantity: number;
  discountTier: string;
  pickupWindowEnd: string;
}

export default function RestaurantDashboard() {
  const { authenticatedFetch, logout } = useAuth();
  
  const [showScanner, setShowScanner] = useState(false);
  const [activeListings, setActiveListings] = useState<SurplusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [co2Saved, setCo2Saved] = useState('0 kg');
  
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [discountTier, setDiscountTier] = useState<'FREE' | '50% OFF' | '75% OFF'>('50% OFF');
  const [pickupHours, setPickupHours] = useState<number>(1);

  const fetchListings = async () => {
    try {
      const res = await authenticatedFetch(`${API_URL}/api/v1/surplus`);
      if (res.ok) {
        const data = await res.json();
        // Just show all for now or assume backend filters by restaurant if needed
        setActiveListings(data);
      }
    } catch (e) {
      console.error('Failed to fetch listings:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await authenticatedFetch(`${API_URL}/api/v1/me`);
      if (res.ok) {
        const data = await res.json();
        if (data.co2Saved) setCo2Saved(`${data.co2Saved} kg`);
      }
    } catch (e) {
      // Ignored
    }
  };

  useEffect(() => {
    fetchListings();
    fetchStats();
  }, []);

  const handleAddItem = async () => {
    if (!name || !quantity || !originalPrice) {
      Alert.alert('Validation Error', 'Please fill all fields');
      return;
    }

    setSubmitting(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Error', 'Location is required to list an item');
        setSubmitting(false);
        return;
      }

      let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      
      const now = new Date();
      const end = new Date(now.getTime() + pickupHours * 60 * 60 * 1000);

      // Map display tiers to backend expected values if needed. 
      // The instructions say: "HALF_OFF" | "THREE_QUARTER_OFF" | "FREE"
      let tierMapped = 'HALF_OFF';
      if (discountTier === '75% OFF') tierMapped = 'THREE_QUARTER_OFF';
      if (discountTier === 'FREE') tierMapped = 'FREE';

      const payload = {
        name,
        quantity: parseInt(quantity, 10),
        originalPrice: parseFloat(originalPrice),
        discountTier: tierMapped,
        pickupWindowStart: now.toISOString(),
        pickupWindowEnd: end.toISOString(),
        lat: location.coords.latitude,
        lng: location.coords.longitude
      };

      const res = await authenticatedFetch(`${API_URL}/api/v1/surplus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        Alert.alert('Success', 'Item listed successfully');
        setName('');
        setQuantity('');
        setOriginalPrice('');
        fetchListings();
      } else {
        const error = await res.json();
        Alert.alert('Error', error.message || 'Failed to list item');
      }
    } catch (e) {
      Alert.alert('Error', 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  if (showScanner) {
    return (
      <View style={{ flex: 1, backgroundColor: '#1a1a2e' }}>
        <RestaurantScanner />
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => setShowScanner(false)}
        >
          <Text style={styles.backButtonText}>← Back to Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🍽️ Save Plate — Restaurant</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{co2Saved}</Text>
            <Text style={styles.statLabel}>CO2 Saved</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{activeListings.length}</Text>
            <Text style={styles.statLabel}>Active Listings</Text>
          </View>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Add New Item</Text>
          
          <TextInput 
            style={styles.input} 
            placeholder="Item Name" 
            placeholderTextColor="#888"
            value={name}
            onChangeText={setName}
          />
          
          <View style={styles.row}>
            <TextInput 
              style={[styles.input, { flex: 1, marginRight: 10 }]} 
              placeholder="Qty" 
              placeholderTextColor="#888"
              keyboardType="number-pad"
              value={quantity}
              onChangeText={setQuantity}
            />
            <TextInput 
              style={[styles.input, { flex: 1 }]} 
              placeholder="Orig. Price" 
              placeholderTextColor="#888"
              keyboardType="decimal-pad"
              value={originalPrice}
              onChangeText={setOriginalPrice}
            />
          </View>

          <Text style={styles.label}>Discount Tier</Text>
          <View style={styles.toggleRow}>
            {['50% OFF', '75% OFF', 'FREE'].map(tier => (
              <TouchableOpacity 
                key={tier}
                style={[styles.toggleBtn, discountTier === tier && styles.toggleBtnActive]}
                onPress={() => setDiscountTier(tier as any)}
              >
                <Text style={[styles.toggleText, discountTier === tier && styles.toggleTextActive]}>{tier}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Available for next</Text>
          <View style={styles.toggleRow}>
            {[1, 2, 3].map(hr => (
              <TouchableOpacity 
                key={hr}
                style={[styles.toggleBtn, pickupHours === hr && styles.toggleBtnActive]}
                onPress={() => setPickupHours(hr)}
              >
                <Text style={[styles.toggleText, pickupHours === hr && styles.toggleTextActive]}>{hr} hr</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity 
            style={styles.submitButton} 
            onPress={handleAddItem}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color="#1a1a2e" /> : <Text style={styles.submitButtonText}>List Item</Text>}
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Active Listings</Text>
        {loading ? (
          <ActivityIndicator color="#FF8C00" style={{ marginTop: 20 }} />
        ) : activeListings.length === 0 ? (
          <Text style={styles.emptyText}>No active listings yet</Text>
        ) : (
          activeListings.map(item => {
            // Figure out time remaining
            const ends = new Date(item.pickupWindowEnd);
            const now = new Date();
            const diffMs = ends.getTime() - now.getTime();
            const hrs = Math.max(0, Math.floor(diffMs / 3600000));
            const mins = Math.max(0, Math.floor((diffMs % 3600000) / 60000));

            return (
              <View key={item.id} style={styles.listingCard}>
                <View>
                  <Text style={styles.listingName}>{item.name}</Text>
                  <Text style={styles.listingQty}>Qty: {item.quantity}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.listingTier}>{item.discountTier}</Text>
                  <Text style={styles.listingTime}>{hrs}h {mins}m left</Text>
                </View>
              </View>
            )
          })
        )}
        
        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.scanButton} onPress={() => setShowScanner(true)}>
          <Text style={styles.scanButtonText}>📷 Scan Pickup QR</Text>
        </TouchableOpacity>
      </View>
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
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  logoutButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#16213e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF8C00'
  },
  logoutText: { color: '#FF8C00', fontSize: 14, fontWeight: 'bold' },
  content: { flex: 1 },
  contentContainer: { padding: 20 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  statCard: { 
    backgroundColor: '#16213e', 
    flex: 0.48, 
    borderRadius: 12, 
    padding: 16, 
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333'
  },
  statValue: { color: '#FF8C00', fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  statLabel: { color: '#aaa', fontSize: 12 },
  formCard: { 
    backgroundColor: '#16213e', 
    borderRadius: 16, 
    padding: 20, 
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#333'
  },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  input: { 
    backgroundColor: '#1a1a2e', 
    color: '#fff', 
    borderRadius: 8, 
    padding: 12, 
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#444'
  },
  row: { flexDirection: 'row' },
  label: { color: '#aaa', fontSize: 14, marginBottom: 8, marginTop: 4 },
  toggleRow: { flexDirection: 'row', marginBottom: 16 },
  toggleBtn: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    paddingVertical: 10,
    marginHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444'
  },
  toggleBtnActive: { backgroundColor: '#FF8C00', borderColor: '#FF8C00' },
  toggleText: { color: '#888', fontSize: 12, fontWeight: 'bold' },
  toggleTextActive: { color: '#1a1a2e' },
  submitButton: { 
    backgroundColor: '#FF8C00', 
    padding: 16, 
    borderRadius: 12, 
    alignItems: 'center',
    marginTop: 8
  },
  submitButtonText: { color: '#1a1a2e', fontWeight: 'bold', fontSize: 16 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 10, fontStyle: 'italic' },
  listingCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333'
  },
  listingName: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  listingQty: { color: '#aaa', fontSize: 14 },
  listingTier: { color: '#FF8C00', fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  listingTime: { color: '#888', fontSize: 12 },
  bottomNav: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#1a1a2e',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#333'
  },
  scanButton: {
    backgroundColor: '#16213e',
    borderWidth: 1,
    borderColor: '#FF8C00',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center'
  },
  scanButtonText: { color: '#FF8C00', fontWeight: 'bold', fontSize: 16 },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: '#1a1a2e',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF8C00',
    zIndex: 100
  },
  backButtonText: { color: '#FF8C00', fontWeight: 'bold' }
});
