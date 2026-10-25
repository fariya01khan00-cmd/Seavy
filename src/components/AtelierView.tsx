import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AtelierProduct, AtelierSubView, OrderRecord, UserProfile } from '../types';
import { INITIAL_ORDERS, STITCH_ASSETS } from '../data/demoData';
import { ResilientImage } from './ResilientImage';
import { PaymentConfirmation } from './PaymentConfirmation';

interface AtelierViewProps {
  subView: AtelierSubView;
  onChangeSubView: (v: AtelierSubView) => void;
  products: AtelierProduct[];
  wishlistIds: string[];
  onToggleWishlist: (id: string) => void;
  cartQuantities: Record<string, number>;
  onUpdateCartQty: (id: string, delta: number) => void;
  onMoveAllWishlistToCart: () => void;
  onClearCart: () => void;
  profile: UserProfile;
  onUpdateProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  onShowToast: (msg: string) => void;
}

const ORDERS_STORAGE_KEY = 'saevy_atelier_orders_v2';
const CUSTOM_GADGETS_STORAGE_KEY = 'saevy_custom_gadgets_v2';

export const AtelierView: React.FC<AtelierViewProps> = ({
  subView,
  onChangeSubView,
  products: initialProducts,
  wishlistIds,
  onToggleWishlist,
  cartQuantities,
  onUpdateCartQty,
  onMoveAllWishlistToCart,
  onClearCart,
  profile,
  onUpdateProfile,
  onShowToast,
}) => {
  // Custom added gadgets (persisted in localStorage)
  const [customGadgets, setCustomGadgets] = useState<AtelierProduct[]>(() => {
    try {
      const raw = window.localStorage.getItem(CUSTOM_GADGETS_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  });

  const allProducts = useMemo(() => {
    return [...customGadgets, ...initialProducts];
  }, [customGadgets, initialProducts]);

  // Orders list (persisted in localStorage)
  const [orders, setOrders] = useState<OrderRecord[]>(() => {
    try {
      const raw = window.localStorage.getItem(ORDERS_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return INITIAL_ORDERS;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
    } catch {}
  }, [orders]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CUSTOM_GADGETS_STORAGE_KEY, JSON.stringify(customGadgets));
    } catch {}
  }, [customGadgets]);

  const [catalogCategory, setCatalogCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Add New Gadget Modal State
  const [addGadgetModalOpen, setAddGadgetModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<AtelierProduct['category']>('Critical Safety Gadgets');
  const [newPrice, setNewPrice] = useState('899');
  const [newOriginalPrice, setNewOriginalPrice] = useState('1499');
  const [newTechSpec, setNewTechSpec] = useState('130dB Strobe Alert');
  const [newDescription, setNewDescription] = useState('');
  const [newImageUrl, setNewImageUrl] = useState(STITCH_ASSETS.productSiren);

  // Checkout form state
  const [recipientName, setRecipientName] = useState(profile.fullName || 'Saevy Member');
  const [deliveryPhone, setDeliveryPhone] = useState(profile.phone || '+91 98201 11001');
  const [deliveryAddress, setDeliveryAddress] = useState(
    profile.deliveryAddress || 'Flat 402, Lotus Orchid, Bandra West, Mumbai 400050'
  );
  const [pincode, setPincode] = useState('400050');
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card' | 'emi' | 'cod'>('upi');
  const [upiOption, setUpiOption] = useState<'gpay' | 'phonepe' | 'paytm' | 'custom'>('gpay');
  const [customUpiId, setCustomUpiId] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [selectedEmiBank, setSelectedEmiBank] = useState('HDFC Bank');
  const [selectedEmiTenure, setSelectedEmiTenure] = useState('3 Months');
  const [checkoutError, setCheckoutError] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Active / Last placed order
  const [activeTrackingOrderId, setActiveTrackingOrderId] = useState<string>(() => orders[0]?.id || '');
  const [latestOrder, setLatestOrder] = useState<OrderRecord | null>(() => orders[0] || null);

  // Cart summary calculations
  const cartEntries = useMemo(() => {
    return Object.entries(cartQuantities)
      .map(([id, qty]) => {
        const prod = allProducts.find((p) => p.id === id);
        return prod && qty > 0 ? { product: prod, quantity: qty } : null;
      })
      .filter((e): e is { product: AtelierProduct; quantity: number } => Boolean(e));
  }, [cartQuantities, allProducts]);

  const cartItemCount = useMemo(() => {
    return Object.values(cartQuantities).reduce((acc, q) => acc + q, 0);
  }, [cartQuantities]);

  const subtotalPrice = useMemo(() => {
    return cartEntries.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  }, [cartEntries]);

  // Filtered Catalog
  const filteredProducts = useMemo(() => {
    return allProducts.filter((p) => {
      if (catalogCategory !== 'All' && p.category !== catalogCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.techSpec.toLowerCase().includes(q);
      }
      return true;
    });
  }, [allProducts, catalogCategory, searchQuery]);

  // Active tracking order
  const activeOrder = useMemo(() => {
    return orders.find((o) => o.id === activeTrackingOrderId) || orders[0] || null;
  }, [orders, activeTrackingOrderId]);

  // Handle Add New Gadget form submission
  const handleAddNewGadgetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      onShowToast('Please enter a gadget name');
      return;
    }
    const priceNum = Math.max(99, Number(newPrice) || 499);
    const origPriceNum = Math.max(priceNum, Number(newOriginalPrice) || priceNum + 500);

    const newProd: AtelierProduct = {
      id: `custom-gadget-${Date.now()}`,
      title: newTitle.trim(),
      subtitle: 'Original Verified Safety Gadget',
      category: newCategory,
      wishlistCategory: 'Wearables',
      badge: 'New Arrival',
      specChip: newTechSpec.trim() || 'Safety Spec',
      material: 'Impact Polymer & Tactical Alloy',
      techSpec: newTechSpec.trim() || 'Safety Hardware',
      description: newDescription.trim() || 'Original certified personal safety gadget with rapid activation.',
      price: priceNum,
      originalPrice: origPriceNum,
      rating: 5.0,
      shippingNote: 'Fast Insured Courier · Express 2-Day Delivery',
      imageUrl: newImageUrl || STITCH_ASSETS.productRing,
    };

    setCustomGadgets((prev) => [newProd, ...prev]);
    setAddGadgetModalOpen(false);
    setNewTitle('');
    setNewDescription('');
    onShowToast(`Added "${newProd.title}" to Original Gadgets!`);
  };

  // Handle Checkout / Payment Submission
  const handlePlaceOrder = () => {
    if (cartEntries.length === 0) {
      onShowToast('Your cart is empty');
      return;
    }
    if (!recipientName.trim() || !deliveryAddress.trim()) {
      setCheckoutError('Please provide delivery recipient name and shipping address');
      return;
    }

    setCheckoutError('');
    setIsProcessingPayment(true);

    const paymentTypeVal: 'cash' | 'card' | 'upi' | 'emi' =
      paymentMethod === 'cod' ? 'cash' : (paymentMethod as 'card' | 'upi' | 'emi');

    let paymentMethodLabel = 'UPI';
    let paymentDetails: OrderRecord['paymentDetails'] = {};

    if (paymentMethod === 'upi') {
      const upiDisplay = upiOption === 'custom' ? (customUpiId.trim() || 'user@upi') : `${upiOption.toUpperCase()} UPI`;
      paymentMethodLabel = `UPI (${upiDisplay})`;
      paymentDetails = {
        upiAppOrId: upiDisplay,
        utrNumber: `UTR${Math.floor(100000000000 + Math.random() * 900000000000)}`,
      };
    } else if (paymentMethod === 'card') {
      const last4 = cardNumber.replace(/\D/g, '').slice(-4) || '8821';
      paymentMethodLabel = `Card (Ending in ${last4})`;
      paymentDetails = {
        cardLast4: last4,
        cardNetwork: 'Visa / RuPay / Mastercard',
        authCode: `AUTH-${Math.floor(100000 + Math.random() * 900000)}`,
      };
    } else if (paymentMethod === 'emi') {
      paymentMethodLabel = `EMI (${selectedEmiBank} · ${selectedEmiTenure})`;
      const months = parseInt(selectedEmiTenure, 10) || 3;
      paymentDetails = {
        emiBank: selectedEmiBank,
        emiTenure: selectedEmiTenure,
        emiMonthlyAmount: Math.round(subtotalPrice / months),
      };
    } else {
      paymentMethodLabel = 'Cash on Delivery (COD)';
      paymentDetails = {
        cashDueOnDelivery: subtotalPrice,
      };
    }

    setTimeout(() => {
      setIsProcessingPayment(false);

      const newOrderNum = `SV-ORD-${Math.floor(10000 + Math.random() * 90000)}`;
      const orderItems = cartEntries.map((c) => ({
        productId: c.product.id,
        title: c.product.title,
        quantity: c.quantity,
        price: c.product.price,
        imageUrl: c.product.imageUrl,
      }));

      const newOrder: OrderRecord = {
        id: `ord-${Date.now()}`,
        orderNumber: newOrderNum,
        createdAt: 'Just now',
        items: orderItems,
        totalAmount: subtotalPrice,
        status: 'confirmed',
        deliveryAddress: `${deliveryAddress.trim()}, PIN: ${pincode.trim() || '400050'}`,
        recipientName: recipientName.trim(),
        recipientPhone: deliveryPhone.trim(),
        paymentMethod: paymentMethodLabel,
        paymentType: paymentTypeVal,
        paymentDetails,
        courierPartner: 'BlueDart Express',
        trackingNumber: `BLU-${Math.floor(10000000 + Math.random() * 90000000)}`,
        estimatedDelivery: 'In 2 Business Days',
        checkpoints: [
          { time: 'Just now', location: 'Saevy Sanctuary Fulfillment Center, Mumbai', status: 'Payment Successful & Order Confirmed', completed: true },
          { time: 'Today, 03:00 PM', location: 'Saevy Tech QC Warehouse', status: 'Original Gadget Quality Verified & Safety Box Sealed', completed: false },
          { time: 'Tomorrow, 10:00 AM', location: 'Express Cargo Terminal', status: 'Dispatched with BlueDart Express Courier', completed: false },
          { time: 'In 2 Days, 09:00 AM', location: 'Local Delivery Hub', status: 'Out for Delivery with OTP Verified Agent', completed: false },
          { time: 'In 2 Days, 04:00 PM', location: 'Recipient Safe Sanctuary Address', status: 'Delivered Securely to You', completed: false },
        ],
      };

      setOrders((prev) => [newOrder, ...prev]);
      setLatestOrder(newOrder);
      setActiveTrackingOrderId(newOrder.id);
      onClearCart();
      onChangeSubView('receipt');
      onShowToast(
        paymentTypeVal === 'cash'
          ? `Order Confirmed! Cash of ₹${subtotalPrice} to be paid on delivery.`
          : `Payment Successful! Order ${newOrderNum} confirmed.`
      );
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Top Boutique Navigation Ribbon */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline-variant/60 pb-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-on-surface">
            Safety Gadgets Atelier
          </h1>
          <p className="text-xs sm:text-sm text-on-surface-variant">
            Original certified personal safety gadgets, instant checkout, and real-time order tracking.
          </p>
        </div>

        {/* View Switchers + Cart Badge + Add Gadget Button */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => onChangeSubView('catalog')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              subView === 'catalog'
                ? 'bg-[#171412] text-[#F6F1EA] dark:bg-[#D4AF37] dark:text-[#171412]'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Gadgets ({allProducts.length})
          </button>

          <button
            type="button"
            onClick={() => onChangeSubView('tracking')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
              subView === 'tracking'
                ? 'bg-[#171412] text-[#F6F1EA] dark:bg-[#D4AF37] dark:text-[#171412]'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">local_shipping</span>
            <span>Track Orders ({orders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeSubView('cart')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
              subView === 'cart' || subView === 'checkout'
                ? 'bg-[#D4AF37] text-[#171412] font-semibold'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">shopping_cart</span>
            <span>Cart</span>
            {cartItemCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-[#171412] text-white dark:bg-white dark:text-black text-[10px] font-bold flex items-center justify-center">
                {cartItemCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setAddGadgetModalOpen(true)}
            className="px-3.5 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs flex items-center gap-1 shadow-sm active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">add_circle</span>
            <span>+ Add New Gadget</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: CATALOG */}
      {subView === 'catalog' && (
        <div className="space-y-5">
          {/* Category Filter Chips & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              {['All', 'Fine Jewelry', 'Covert Alarms', 'Critical Safety Gadgets', 'Mesh Trackers'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCatalogCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    catalogCategory === cat
                      ? 'bg-[#171412] text-[#F6F1EA] dark:bg-[#D4AF37] dark:text-[#171412]'
                      : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="relative min-w-[220px]">
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search original gadgets..."
                className="w-full bg-surface-container text-on-surface rounded-full pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              />
            </div>
          </div>

          {/* Gadgets Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredProducts.map((product) => {
              const qtyInCart = cartQuantities[product.id] || 0;
              const isWishlisted = wishlistIds.includes(product.id);

              return (
                <div
                  key={product.id}
                  className="luxury-card overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow group"
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-surface-container-high/60">
                    <ResilientImage
                      src={product.imageUrl}
                      alt={product.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      fallbackIcon="verified"
                    />
                    <div className="absolute top-2.5 left-2.5">
                      <span className="px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-[10px] font-semibold text-[#D4AF37] border border-[#D4AF37]/40">
                        {product.badge}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleWishlist(product.id)}
                      className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white hover:text-rose-400 transition-colors"
                    >
                      <span className={`material-symbols-outlined text-[18px] ${isWishlisted ? 'text-rose-400 material-symbols-filled' : ''}`}>
                        favorite
                      </span>
                    </button>
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-[#D4AF37] font-medium">
                        <span>{product.category}</span>
                        <span>{product.specChip}</span>
                      </div>
                      <h3 className="font-bold text-sm sm:text-base text-on-surface leading-snug">
                        {product.title}
                      </h3>
                      <p className="text-xs text-on-surface-variant line-clamp-2 leading-relaxed">
                        {product.description}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-outline-variant/40 space-y-2">
                      <div className="flex items-baseline justify-between">
                        <div className="flex items-baseline gap-2">
                          <span className="font-bold text-base sm:text-lg text-on-surface">
                            ₹{product.price}
                          </span>
                          {product.originalPrice > product.price && (
                            <span className="text-xs text-on-surface-variant line-through">
                              ₹{product.originalPrice}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-emerald-600 font-medium">Original Hardware</span>
                      </div>

                      {qtyInCart === 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateCartQty(product.id, 1);
                            onShowToast(`Added ${product.title} to Cart`);
                          }}
                          className="w-full py-2 rounded-xl bg-[#171412] dark:bg-[#D4AF37] text-[#F6F1EA] dark:text-[#171412] text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-sm"
                        >
                          <span className="material-symbols-outlined text-[16px]">add_shopping_cart</span>
                          <span>Add to Cart</span>
                        </button>
                      ) : (
                        <div className="flex items-center justify-between bg-surface-container rounded-xl p-1 border border-[#D4AF37]/50">
                          <button
                            type="button"
                            onClick={() => onUpdateCartQty(product.id, -1)}
                            className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface font-bold text-sm"
                          >
                            -
                          </button>
                          <span className="font-bold text-xs text-on-surface">
                            {qtyInCart} in Cart
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateCartQty(product.id, 1)}
                            className="w-7 h-7 rounded-lg bg-[#171412] dark:bg-[#D4AF37] text-white dark:text-black flex items-center justify-center font-bold text-sm"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 2: CART */}
      {subView === 'cart' && (
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-outline-variant/60">
            <h2 className="font-display font-bold text-xl text-on-surface">Your Safety Cart ({cartItemCount} items)</h2>
            <button
              type="button"
              onClick={() => onChangeSubView('catalog')}
              className="text-xs text-[#D4AF37] font-semibold hover:underline"
            >
              + Continue Shopping
            </button>
          </div>

          {cartEntries.length === 0 ? (
            <div className="luxury-card p-12 text-center space-y-3">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant">shopping_bag</span>
              <p className="font-semibold text-sm text-on-surface">Your cart is empty</p>
              <p className="text-xs text-on-surface-variant">Explore our authentic certified safety gadgets catalog.</p>
              <button
                type="button"
                onClick={() => onChangeSubView('catalog')}
                className="btn-luxury px-6 text-xs font-semibold"
              >
                Browse Gadgets
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2.5">
                {cartEntries.map(({ product, quantity }) => (
                  <div
                    key={product.id}
                    className="luxury-card p-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-surface-container shrink-0">
                      <ResilientImage
                        src={product.imageUrl}
                        alt={product.title}
                        className="w-full h-full object-cover"
                        fallbackIcon="shield"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-xs sm:text-sm text-on-surface truncate">
                        {product.title}
                      </h4>
                      <p className="text-[11px] text-on-surface-variant">{product.techSpec}</p>
                      <span className="font-bold text-sm text-on-surface">₹{product.price}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onUpdateCartQty(product.id, -1)}
                        className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center font-bold"
                      >
                        -
                      </button>
                      <span className="text-xs font-bold tabular-nums">{quantity}</span>
                      <button
                        type="button"
                        onClick={() => onUpdateCartQty(product.id, 1)}
                        className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Order Price Summary */}
              <div className="luxury-card p-4 space-y-3">
                <div className="flex justify-between text-xs text-on-surface-variant">
                  <span>Subtotal</span>
                  <span>₹{subtotalPrice}</span>
                </div>
                <div className="flex justify-between text-xs text-on-surface-variant">
                  <span>Insured Express Shipping</span>
                  <span className="text-emerald-600 font-semibold">FREE</span>
                </div>
                <div className="flex justify-between font-bold text-base text-on-surface pt-2 border-t border-outline-variant/40">
                  <span>Total Amount</span>
                  <span>₹{subtotalPrice}</span>
                </div>

                <button
                  type="button"
                  onClick={() => onChangeSubView('checkout')}
                  className="w-full py-3 rounded-xl bg-[#171412] dark:bg-[#D4AF37] text-[#F6F1EA] dark:text-[#171412] font-semibold text-sm shadow-md active:scale-98 transition-all flex items-center justify-center gap-2"
                >
                  <span>Proceed to Payment</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: CHECKOUT & PAYMENT METHOD */}
      {subView === 'checkout' && (
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="flex items-center justify-between pb-2 border-b border-outline-variant/60">
            <h2 className="font-display font-bold text-xl text-on-surface">Delivery &amp; Payment Options</h2>
            <button
              type="button"
              onClick={() => onChangeSubView('cart')}
              className="text-xs text-[#D4AF37] font-semibold hover:underline"
            >
              ← Back to Cart
            </button>
          </div>

          {checkoutError && (
            <div className="p-3 rounded-xl bg-rose-100 text-rose-800 text-xs font-medium dark:bg-rose-950/80 dark:text-rose-200">
              {checkoutError}
            </div>
          )}

          {/* Section A: Delivery Details */}
          <div className="luxury-card p-4 space-y-3">
            <h3 className="font-bold text-sm text-on-surface flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">location_on</span>
              <span>1. Delivery Sanctuary Address</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-on-surface-variant">Recipient Full Name</label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full bg-surface-container rounded-lg p-2 text-xs text-on-surface mt-1 focus:ring-1 focus:ring-[#D4AF37] outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-on-surface-variant">Contact Phone Number</label>
                <input
                  type="tel"
                  value={deliveryPhone}
                  onChange={(e) => setDeliveryPhone(e.target.value)}
                  className="w-full bg-surface-container rounded-lg p-2 text-xs text-on-surface mt-1 focus:ring-1 focus:ring-[#D4AF37] outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[11px] font-medium text-on-surface-variant">Street / Flat / Colony Address</label>
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="w-full bg-surface-container rounded-lg p-2 text-xs text-on-surface mt-1 focus:ring-1 focus:ring-[#D4AF37] outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-on-surface-variant">Pincode</label>
                <input
                  type="text"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  className="w-full bg-surface-container rounded-lg p-2 text-xs text-on-surface mt-1 focus:ring-1 focus:ring-[#D4AF37] outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section B: Payment Methods (UPI, Cards, Net Banking / EMI, Cash on Delivery) */}
          <div className="luxury-card p-4 space-y-4">
            <h3 className="font-bold text-sm text-on-surface flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">credit_card</span>
              <span>2. Choose Payment Method</span>
            </h3>

            {/* 4 Main Payment Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('upi')}
                className={`p-3 rounded-xl border text-center transition-all ${
                  paymentMethod === 'upi'
                    ? 'border-[#D4AF37] bg-surface-container-highest shadow-sm'
                    : 'border-outline-variant/60 bg-surface-container'
                }`}
              >
                <span className="material-symbols-outlined text-2xl block mx-auto text-[#D4AF37]">
                  account_balance_wallet
                </span>
                <span className="text-xs font-bold block mt-1">UPI</span>
                <span className="text-[10px] text-on-surface-variant">GPay / PhonePe / Paytm</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`p-3 rounded-xl border text-center transition-all ${
                  paymentMethod === 'card'
                    ? 'border-[#D4AF37] bg-surface-container-highest shadow-sm'
                    : 'border-outline-variant/60 bg-surface-container'
                }`}
              >
                <span className="material-symbols-outlined text-2xl block mx-auto text-[#D4AF37]">
                  credit_card
                </span>
                <span className="text-xs font-bold block mt-1">Card</span>
                <span className="text-[10px] text-on-surface-variant">Visa / Master / RuPay</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('emi')}
                className={`p-3 rounded-xl border text-center transition-all ${
                  paymentMethod === 'emi'
                    ? 'border-[#D4AF37] bg-surface-container-highest shadow-sm'
                    : 'border-outline-variant/60 bg-surface-container'
                }`}
              >
                <span className="material-symbols-outlined text-2xl block mx-auto text-[#D4AF37]">
                  payments
                </span>
                <span className="text-xs font-bold block mt-1">EMI</span>
                <span className="text-[10px] text-on-surface-variant">Easy Monthly Plans</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('cod')}
                className={`p-3 rounded-xl border text-center transition-all ${
                  paymentMethod === 'cod'
                    ? 'border-[#D4AF37] bg-surface-container-highest shadow-sm'
                    : 'border-outline-variant/60 bg-surface-container'
                }`}
              >
                <span className="material-symbols-outlined text-2xl block mx-auto text-[#D4AF37]">
                  local_shipping
                </span>
                <span className="text-xs font-bold block mt-1">Cash (COD)</span>
                <span className="text-[10px] text-on-surface-variant">Pay on Delivery</span>
              </button>
            </div>

            {/* Sub-form depending on chosen method */}
            <div className="p-3.5 rounded-xl bg-surface-container-high/80 border border-outline-variant/50 space-y-3">
              {paymentMethod === 'upi' && (
                <div className="space-y-2.5">
                  <span className="text-xs font-semibold text-on-surface">Select Instant UPI App:</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'gpay', label: 'Google Pay' },
                      { id: 'phonepe', label: 'PhonePe' },
                      { id: 'paytm', label: 'Paytm' },
                      { id: 'custom', label: 'Enter UPI ID' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setUpiOption(opt.id as any)}
                        className={`p-2 rounded-lg text-xs font-medium border text-center ${
                          upiOption === opt.id
                            ? 'bg-[#171412] text-white dark:bg-[#D4AF37] dark:text-black border-[#D4AF37]'
                            : 'bg-surface-container border-outline-variant/60'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {upiOption === 'custom' && (
                    <input
                      type="text"
                      value={customUpiId}
                      onChange={(e) => setCustomUpiId(e.target.value)}
                      placeholder="e.g. yourname@okhdfcbank"
                      className="w-full bg-surface-container rounded-lg p-2 text-xs outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    />
                  )}
                </div>
              )}

              {paymentMethod === 'card' && (
                <div className="space-y-2.5">
                  <div>
                    <label className="text-[11px] font-medium text-on-surface-variant">Card Number</label>
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      placeholder="4532 ···· ···· 8821"
                      className="w-full bg-surface-container rounded-lg p-2 text-xs mt-0.5 outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-on-surface-variant">Expiry (MM/YY)</label>
                      <input
                        type="text"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        placeholder="08/28"
                        className="w-full bg-surface-container rounded-lg p-2 text-xs mt-0.5 outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-on-surface-variant">CVV</label>
                      <input
                        type="password"
                        maxLength={4}
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value)}
                        placeholder="•••"
                        className="w-full bg-surface-container rounded-lg p-2 text-xs mt-0.5 outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === 'emi' && (
                <div className="space-y-2.5">
                  <div>
                    <label className="text-[11px] font-medium text-on-surface-variant">Select Bank</label>
                    <select
                      value={selectedEmiBank}
                      onChange={(e) => setSelectedEmiBank(e.target.value)}
                      className="w-full bg-surface-container rounded-lg p-2 text-xs mt-0.5 outline-none"
                    >
                      <option value="HDFC Bank">HDFC Bank Credit Card EMI</option>
                      <option value="ICICI Bank">ICICI Bank Credit Card EMI</option>
                      <option value="SBI Card">SBI Credit Card EMI</option>
                      <option value="Axis Bank">Axis Bank Credit Card EMI</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { tenure: '3 Months', amount: `₹${Math.round(subtotalPrice / 3)}/mo` },
                      { tenure: '6 Months', amount: `₹${Math.round(subtotalPrice / 6)}/mo` },
                      { tenure: '12 Months', amount: `₹${Math.round(subtotalPrice / 12)}/mo` },
                    ].map((plan) => (
                      <button
                        key={plan.tenure}
                        type="button"
                        onClick={() => setSelectedEmiTenure(plan.tenure)}
                        className={`p-2 rounded-lg text-center border text-xs ${
                          selectedEmiTenure === plan.tenure
                            ? 'bg-[#171412] text-white dark:bg-[#D4AF37] dark:text-black border-[#D4AF37]'
                            : 'bg-surface-container border-outline-variant/60'
                        }`}
                      >
                        <span className="font-bold block">{plan.tenure}</span>
                        <span className="text-[10px]">{plan.amount}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {paymentMethod === 'cod' && (
                <div className="text-xs text-on-surface space-y-1">
                  <p className="font-semibold text-emerald-600">✓ Cash on Delivery Available</p>
                  <p className="text-on-surface-variant">Pay safely in cash or UPI QR code to the verified courier agent upon package arrival.</p>
                </div>
              )}
            </div>

            {/* Total Pay button */}
            <button
              type="button"
              disabled={isProcessingPayment}
              onClick={handlePlaceOrder}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#171412] via-[#241E34] to-[#171412] dark:from-[#D4AF37] dark:via-[#F5D97E] dark:to-[#D4AF37] text-[#F6F1EA] dark:text-[#171412] font-bold text-sm shadow-lg flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50"
            >
              {isProcessingPayment ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/60 border-t-white animate-spin" />
                  <span>Processing Payment Securely...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">verified_user</span>
                  <span>Pay ₹{subtotalPrice} &amp; Confirm Order</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* VIEW 4: PAYMENT SUCCESSFUL & RECEIPT */}
      {subView === 'receipt' && (
        (() => {
          const orderToDisplay = latestOrder || orders[0] || null;
          if (!orderToDisplay) {
            return (
              <div className="max-w-xl mx-auto luxury-card p-8 text-center space-y-4">
                <span className="material-symbols-outlined text-5xl text-on-surface-variant">receipt_long</span>
                <h3 className="font-display font-bold text-lg text-on-surface">No Recent Order Found</h3>
                <p className="text-xs text-on-surface-variant">Browse our authentic safety gadgets and place your first order.</p>
                <button
                  type="button"
                  onClick={() => onChangeSubView('catalog')}
                  className="btn-luxury px-6 text-xs font-semibold"
                >
                  Back to Catalog
                </button>
              </div>
            );
          }

          return (
            <PaymentConfirmation
              order={orderToDisplay}
              onBackToCatalog={() => onChangeSubView('catalog')}
              onTrackOrder={(orderId) => {
                setActiveTrackingOrderId(orderId);
                onChangeSubView('tracking');
              }}
              onShowToast={onShowToast}
            />
          );
        })()
      )}

      {/* VIEW 5: ORDER TRACKING */}
      {subView === 'tracking' && (
        <div className="max-w-3xl mx-auto space-y-5">
          <div className="flex items-center justify-between pb-2 border-b border-outline-variant/60">
            <div>
              <h2 className="font-display font-bold text-xl text-on-surface">Track Your Orders</h2>
              <p className="text-xs text-on-surface-variant">Real-time GPS dispatch &amp; courier verification</p>
            </div>
            <button
              type="button"
              onClick={() => onChangeSubView('catalog')}
              className="text-xs text-[#D4AF37] font-semibold hover:underline"
            >
              + Shop More Gadgets
            </button>
          </div>

          {orders.length === 0 ? (
            <div className="luxury-card p-10 text-center space-y-3">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant">inventory_2</span>
              <p className="text-sm font-semibold text-on-surface">No active orders found</p>
              <button
                type="button"
                onClick={() => onChangeSubView('catalog')}
                className="btn-luxury px-6 text-xs font-semibold"
              >
                Explore Gadgets
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Order selector tabs if multiple orders */}
              {orders.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                  {orders.map((ord) => (
                    <button
                      key={ord.id}
                      type="button"
                      onClick={() => setActiveTrackingOrderId(ord.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-mono font-medium whitespace-nowrap transition-all ${
                        activeOrder?.id === ord.id
                          ? 'bg-[#171412] text-[#F6F1EA] dark:bg-[#D4AF37] dark:text-[#171412] shadow-sm'
                          : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      {ord.orderNumber}
                    </button>
                  ))}
                </div>
              )}

              {activeOrder && (
                <div className="space-y-4">
                  {/* Order Overview Header Card */}
                  <div className="luxury-card p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-outline-variant/40">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-base text-on-surface">
                            {activeOrder.orderNumber}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold dark:bg-emerald-950/80 dark:text-emerald-200">
                            {activeOrder.status.toUpperCase().replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-on-surface-variant mt-0.5">
                          Courier: <strong className="text-on-surface">{activeOrder.courierPartner}</strong> · Tracking # <strong className="font-mono text-[#D4AF37]">{activeOrder.trackingNumber}</strong>
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-[11px] text-on-surface-variant block">Estimated Delivery</span>
                        <span className="font-bold text-sm text-emerald-600 block">
                          {activeOrder.estimatedDelivery}
                        </span>
                      </div>
                    </div>

                    {/* Ordered items preview */}
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                      {activeOrder.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 bg-surface-container rounded-xl p-2 shrink-0 border border-outline-variant/40"
                        >
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface-container-high shrink-0">
                            <ResilientImage
                              src={item.imageUrl}
                              alt={item.title}
                              className="w-full h-full object-cover"
                              fallbackIcon="shield"
                            />
                          </div>
                          <div className="text-left pr-2">
                            <p className="text-xs font-semibold text-on-surface max-w-[140px] truncate">
                              {item.title}
                            </p>
                            <p className="text-[10px] text-on-surface-variant">Qty: {item.quantity} · ₹{item.price}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Visual Progress Stepper */}
                  <div className="luxury-card p-5 space-y-4">
                    <h3 className="font-bold text-sm text-on-surface flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">alt_route</span>
                      <span>Live Delivery Checkpoints</span>
                    </h3>

                    <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-[2px] before:bg-outline-variant/50">
                      {activeOrder.checkpoints.map((cp, idx) => (
                        <div key={idx} className="relative flex items-start gap-3">
                          <span
                            className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                              cp.completed
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'bg-surface-container border border-outline-variant text-on-surface-variant'
                            }`}
                          >
                            {cp.completed ? '✓' : idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className={`text-xs sm:text-sm font-semibold ${cp.completed ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                                {cp.status}
                              </p>
                              <span className="text-[10px] font-mono text-on-surface-variant shrink-0">{cp.time}</span>
                            </div>
                            <p className="text-[11px] text-on-surface-variant flex items-center gap-1 mt-0.5">
                              <span className="material-symbols-outlined text-[13px]">location_on</span>
                              <span>{cp.location}</span>
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL: ADD NEW ORIGINAL GADGET */}
      <AnimatePresence>
        {addGadgetModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg luxury-card p-5 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-2 border-b border-outline-variant/60">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-2xl text-[#D4AF37]">add_moderator</span>
                  <h3 className="font-display font-bold text-lg text-on-surface">Add Original Safety Gadget</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setAddGadgetModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleAddNewGadgetSubmit} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-on-surface">Gadget Title / Model *</label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Tactical Pinhole Spy Detector"
                    className="w-full bg-surface-container rounded-xl p-2.5 text-xs text-on-surface mt-1 outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-on-surface">Category</label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as any)}
                      className="w-full bg-surface-container rounded-xl p-2.5 text-xs text-on-surface mt-1 outline-none"
                    >
                      <option value="Critical Safety Gadgets">Critical Safety Gadgets</option>
                      <option value="Covert Alarms">Covert Alarms</option>
                      <option value="Mesh Trackers">Mesh Trackers</option>
                      <option value="Fine Jewelry">Fine Jewelry</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-on-surface">Key Tech Specification</label>
                    <input
                      type="text"
                      value={newTechSpec}
                      onChange={(e) => setNewTechSpec(e.target.value)}
                      placeholder="e.g. 130dB + Strobe LED"
                      className="w-full bg-surface-container rounded-xl p-2.5 text-xs text-on-surface mt-1 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-on-surface">Price (₹) *</label>
                    <input
                      type="number"
                      required
                      min={99}
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      className="w-full bg-surface-container rounded-xl p-2.5 text-xs text-on-surface mt-1 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-on-surface">Original Price (₹)</label>
                    <input
                      type="number"
                      min={99}
                      value={newOriginalPrice}
                      onChange={(e) => setNewOriginalPrice(e.target.value)}
                      className="w-full bg-surface-container rounded-xl p-2.5 text-xs text-on-surface mt-1 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-on-surface">Description</label>
                  <textarea
                    rows={2}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Short description of safety capabilities..."
                    className="w-full bg-surface-container rounded-xl p-2.5 text-xs text-on-surface mt-1 outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/40">
                  <button
                    type="button"
                    onClick={() => setAddGadgetModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-surface-container text-xs font-medium text-on-surface"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-[#171412] dark:bg-[#D4AF37] text-[#F6F1EA] dark:text-[#171412] text-xs font-bold shadow-sm"
                  >
                    Save &amp; Add Gadget
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
