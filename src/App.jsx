import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, updateDoc, deleteDoc, addDoc, query, where, Timestamp } from 'firebase/firestore';
import { marked } from 'marked';

const App = () => {
  // Use a fallback to an empty object if process is not defined, which happens outside of the Node.js environment
  const env = typeof process !== 'undefined' && process.env ? process.env : {};

  // Use the Firebase projectId as the unique app ID for Firestore paths
  const firebaseConfig = {
    apiKey: env.REACT_APP_FIREBASE_API_KEY,
    authDomain: env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.REACT_APP_FIREBASE_APP_ID,
    measurementId: env.REACT_APP_FIREBASE_MEASUREMENT_ID,
  };
  const appId = env.REACT_APP_FIREBASE_PROJECT_ID;

  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);
  const [accounts, setAccounts] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const dragItem = useRef(null);

  const funnelStages = [
    { name: 'Business Intel', color: 'bg-stone-500' },
    { name: 'New Leads', color: 'bg-indigo-500' },
    { name: 'Qualified Opportunities', color: 'bg-blue-500' },
    { name: 'Needs Analysis', color: 'bg-purple-500' },
    { name: 'Proposal Sent', color: 'bg-yellow-500' },
    { name: 'Negotiation', color: 'bg-orange-500' },
    { name: 'Closed Won', color: 'bg-green-500' },
    { name: 'Closed Lost', color: 'bg-red-500' },
    { name: 'Nurturing', color: 'bg-gray-500' },
  ];

  // Initialize Firebase and set up auth listener on component mount
  useEffect(() => {
    try {
      if (
        firebaseConfig.apiKey &&
        firebaseConfig.authDomain &&
        firebaseConfig.projectId &&
        firebaseConfig.appId
      ) {
        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const authInstance = getAuth(app);
        setDb(firestore);
        setAuth(authInstance);

        const unsubscribe = onAuthStateChanged(authInstance, (currentUser) => {
          setUser(currentUser);
          setIsLoading(false);
        });
        return () => unsubscribe();
      } else {
        setError("Firebase configuration is missing.");
        setIsLoading(false);
      }
    } catch (err) {
      setError("Failed to initialize the application.");
      setIsLoading(false);
    }
  }, [firebaseConfig.apiKey, firebaseConfig.authDomain, firebaseConfig.projectId, firebaseConfig.appId]);

  // Set up Firestore listener after user is authenticated
  useEffect(() => {
    if (user && db) {
      const accountsRef = collection(db, `artifacts/${appId}/users/${user.uid}/accounts`);
      const q = query(accountsRef);

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedAccounts = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        const organizedAccounts = {};
        funnelStages.forEach(stage => {
          const sortedAccounts = fetchedAccounts.filter(acc => acc.stage === stage.name)
            .sort((a, b) => {
              const dateA = a.nextFollowUpDate?.toDate() || new Date(8640000000000000);
              const dateB = b.nextFollowUpDate?.toDate() || new Date(8640000000000000);
              return dateA - dateB;
            });
          organizedAccounts[stage.name] = sortedAccounts;
        });
        setAccounts(organizedAccounts);
      }, (err) => {
        setError("Failed to load data.");
      });

      return () => unsubscribe();
    }
  }, [user, db, appId, funnelStages]);

  const handleDragStart = (e, item) => {
    dragItem.current = item;
  };

  const handleDragEnd = async (e, stageName) => {
    e.preventDefault();
    if (!dragItem.current || !user) return;
    try {
      const docRef = doc(db, `artifacts/${appId}/users/${user.uid}/accounts`, dragItem.current.id);
      await updateDoc(docRef, { stage: stageName });
      dragItem.current = null;
    } catch (err) {
      setError("Failed to update account stage.");
    }
  };

  const handleAddAccount = async (newAccount) => {
    if (!db || !user) return;
    try {
      const collectionRef = collection(db, `artifacts/${appId}/users/${user.uid}/accounts`);
      await addDoc(collectionRef, {
        ...newAccount,
        stage: 'Business Intel',
        createdAt: Timestamp.now(),
        notes: [],
        value: Number(newAccount.value) || 0,
        monthlyValue: Number(newAccount.monthlyValue) || 0,
        dealScore: 50,
        expectedCloseDate: newAccount.expectedCloseDate ? Timestamp.fromDate(new Date(newAccount.expectedCloseDate)) : null,
        nextFollowUpDate: newAccount.nextFollowUpDate ? Timestamp.fromDate(new Date(newAccount.nextFollowUpDate)) : null,
      });
      setShowModal(false);
      setSelectedAccount(null);
    } catch (err) {
      setError("Failed to add new account.");
    }
  };

  const handleUpdateAccount = async (updatedAccount) => {
    if (!db || !user || !selectedAccount) return;
    try {
      const docRef = doc(db, `artifacts/${appId}/users/${user.uid}/accounts`, selectedAccount.id);
      await updateDoc(docRef, {
        ...updatedAccount,
        value: Number(updatedAccount.value) || 0,
        monthlyValue: Number(updatedAccount.monthlyValue) || 0,
        expectedCloseDate: updatedAccount.expectedCloseDate ? Timestamp.fromDate(new Date(updatedAccount.expectedCloseDate)) : null,
        nextFollowUpDate: updatedAccount.nextFollowUpDate ? Timestamp.fromDate(new Date(updatedAccount.nextFollowUpDate)) : null,
      });
      setShowModal(false);
      setSelectedAccount(null);
    } catch (err) {
      setError("Failed to update account.");
    }
  };

  const handleDeleteAccount = async (accountId) => {
    if (!db || !user) return;
    try {
      const docRef = doc(db, `artifacts/${appId}/users/${user.uid}/accounts`, accountId);
      await deleteDoc(docRef);
      setShowModal(false);
      setSelectedAccount(null);
    } catch (err) {
      setError("Failed to delete account.");
    }
  };

  const totalPipelineValue = Object.values(accounts).flat().filter(acc => acc.stage !== 'Closed Won' && acc.stage !== 'Closed Lost' && acc.stage !== 'Business Intel').reduce((sum, acc) => sum + (acc.value || 0), 0);
  const numberOfActiveDeals = Object.values(accounts).flat().filter(acc => acc.stage !== 'Closed Won' && acc.stage !== 'Closed Lost' && acc.stage !== 'Business Intel').length;
  const upcomingFollowups = Object.values(accounts).flat().filter(acc => {
    if (!acc.nextFollowUpDate) return false;
    const today = new Date();
    const followUpDate = acc.nextFollowUpDate.toDate();
    const timeDiff = followUpDate.getTime() - today.getTime();
    const dayDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
    return dayDiff >= 0 && dayDiff <= 7;
  }).length;

  const getPipelineValues = () => {
    const values = {};
    funnelStages.forEach(stage => {
      values[stage.name] = 0;
    });
    Object.values(accounts).flat().forEach(account => {
      if (account.stage !== 'Closed Won' && account.stage !== 'Closed Lost' && account.stage !== 'Business Intel') {
        values[account.stage] = (values[account.stage] || 0) + (account.value || 0);
      }
    });
    return values;
  };

  const pipelineValues = getPipelineValues();
  const maxPipelineValue = Math.max(...Object.values(pipelineValues));

  const handleLogout = async () => {
    await signOut(auth);
    setAccounts({});
    setSelectedAccount(null);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <svg className="animate-spin -ml-1 mr-3 h-10 w-10 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <div className="mt-4 text-gray-700">Loading CRM...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthComponent auth={auth} />;
  }

  if (error) {
    return <div className="flex items-center justify-center min-h-screen text-red-500 text-lg p-4 bg-gray-100">{error}</div>;
  }

  return (
    <div className="bg-gray-100 min-h-screen font-sans antialiased">
      <script src="https://cdn.tailwindcss.com"></script>
      <div className="p-6">
        <header className="flex items-center justify-between bg-white shadow-sm p-4 rounded-lg mb-6">
          <h1 className="text-2xl font-bold text-gray-800">AI Services CRM</h1>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">Welcome, {user.displayName || user.email}!</span>
            <button
              onClick={() => { setSelectedAccount(null); setShowModal(true); }}
              className="bg-blue-600 text-white px-4 py-2 rounded-full shadow-md hover:bg-blue-700 transition duration-300 ease-in-out transform hover:scale-105"
            >
              + Add New Account
            </button>
            <button
              onClick={handleLogout}
              className="bg-red-600 text-white px-4 py-2 rounded-full shadow-md hover:bg-red-700 transition duration-300 ease-in-out"
            >
              Logout
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <p className="text-sm font-medium text-gray-500">Total Pipeline Value</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">${totalPipelineValue.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <p className="text-sm font-medium text-gray-500">Number of Active Deals</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{numberOfActiveDeals}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <p className="text-sm font-medium text-gray-500">Upcoming Follow-ups (7 days)</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{upcomingFollowups}</p>
          </div>
        </div>

        {/* Pipeline Value Chart */}
        <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Pipeline Value by Stage</h3>
          <div className="flex justify-between items-end h-48 w-full">
            {funnelStages.filter(s => s.name !== 'Closed Won' && s.name !== 'Closed Lost' && s.name !== 'Business Intel').map(stage => (
              <div key={stage.name} className="flex flex-col items-center flex-grow mx-1">
                <div
                  className={`w-full rounded-t-lg transition-all duration-500 ${stage.color}`}
                  style={{ height: `${maxPipelineValue > 0 ? (pipelineValues[stage.name] / maxPipelineValue) * 100 : 0}%` }}
                ></div>
                <div className="mt-2 text-xs text-gray-600 text-center">{stage.name}</div>
                <div className="text-sm font-semibold text-gray-800 mt-1">${(pipelineValues[stage.name] || 0).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex overflow-x-auto gap-4 py-4 scroll-smooth">
          {funnelStages.map(stage => (
            <div
              key={stage.name}
              className="flex-none w-80 min-h-96 bg-gray-200 rounded-lg p-4 shadow-inner"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDragEnd(e, stage.name)}
            >
              <h2 className={`text-lg font-semibold text-white px-3 py-1 mb-4 rounded-full ${stage.color}`}>{stage.name}</h2>
              <div className="space-y-4 min-h-80">
                {accounts[stage.name]?.map(account => (
                  <div
                    key={account.id}
                    className="cursor-grab bg-white p-4 rounded-lg shadow-md transition duration-200 ease-in-out hover:shadow-lg"
                    draggable
                    onDragStart={(e) => handleDragStart(e, account)}
                    onClick={() => { setSelectedAccount(account); setShowModal(true); }}
                  >
                    <p className="font-semibold text-gray-900">{account.companyName}</p>
                    <p className="text-sm text-gray-600 truncate">{account.servicesNeeded}</p>
                    <div className="flex items-center justify-between text-sm mt-2">
                      <p className="text-gray-700 font-bold">${(account.value || 0).toLocaleString()}</p>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${account.dealScore > 80 ? 'bg-green-200 text-green-800' : account.dealScore > 50 ? 'bg-yellow-200 text-yellow-800' : 'bg-red-200 text-red-800'}`}>
                        Score: {account.dealScore}
                      </span>
                    </div>
                    {account.nextFollowUpDate && (
                      <p className="text-xs text-blue-500 mt-2">Follow up: {account.nextFollowUpDate.toDate().toLocaleDateString()}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 relative max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-800">
                {selectedAccount ? 'Edit Account Details' : 'Add New Account'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700 text-2xl font-bold">
                &times;
              </button>
            </div>
            <AccountForm
              account={selectedAccount}
              onSave={selectedAccount ? handleUpdateAccount : handleAddAccount}
              onClose={() => setShowModal(false)}
              onDelete={selectedAccount ? handleDeleteAccount : null}
            />
          </div>
        </div>
      )}
    </div>
  );
};

const AuthComponent = ({ auth }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [authError, setAuthError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);

    if (!isLogin && password !== confirmPassword) {
      setAuthError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: `${firstName} ${lastName}` });
      }
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-90 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-sm">
        <h2 className="text-2xl font-bold text-center mb-6">{isLogin ? 'Login' : 'Sign Up'}</h2>
        {authError && (
          <div className="bg-red-100 text-red-700 text-sm p-3 rounded-lg mb-4">
            {authError}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                  required={!isLogin}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                  required={!isLogin}
                />
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
              required
            />
          </div>
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                required={!isLogin}
              />
            </div>
          )}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-full shadow-md hover:bg-blue-700 transition duration-300 ease-in-out"
            disabled={loading}
          >
            {loading ? 'Processing...' : (isLogin ? 'Login' : 'Sign Up')}
          </button>
        </form>
        <div className="mt-4 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm text-blue-600 hover:underline"
          >
            {isLogin ? 'Need an account? Sign Up' : 'Already have an account? Login'}
          </button>
        </div>
      </div>
    </div>
  );
};

const AccountForm = ({ account, onSave, onClose, onDelete }) => {
  const [formData, setFormData] = useState({
    companyName: account?.companyName || '',
    servicesNeeded: account?.servicesNeeded || '',
    value: account?.value || '',
    monthlyValue: account?.monthlyValue || '',
    expectedCloseDate: account?.expectedCloseDate?.toDate().toISOString().split('T')[0] || '',
    nextFollowUpDate: account?.nextFollowUpDate?.toDate().toISOString().split('T')[0] || '',
    contactName: account?.contactName || '',
    contactTitle: account?.contactTitle || '',
    contactEmail: account?.contactEmail || '',
    contactPhone: account?.contactPhone || '',
    industry: account?.industry || '',
    website: account?.website || '',
    companySize: account?.companySize || '',
    leadSource: account?.leadSource || '',
    stage: account?.stage || 'Business Intel',
    notes: account?.notes || [],
    lostReason: account?.lostReason || '',
    dealScore: account?.dealScore || 50,
  });
  const [newNote, setNewNote] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const recognitionRef = useRef(null);
  const noteRecognitionRef = useRef(null);
  const [isDictatingNotes, setIsDictatingNotes] = useState(false);
  const [isNoteProcessing, setIsNoteProcessing] = useState(false);
  const [dictationStatus, setDictationStatus] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [agenda, setAgenda] = useState('');
  const [isAddingAccount, setIsAddingAccount] = useState(false);

  // IMPORTANT: For production, move API keys to secure environment variables.
  const callGeminiAPI = async (prompt, mimeType = 'text/plain', inlineData = null, responseSchema = null) => {
    // Safely access the environment variable
    const apiKey = typeof process !== 'undefined' ? process.env.REACT_APP_GEMINI_API_KEY : '';
    if (!apiKey) {
      console.error("Gemini API key is not configured.");
      setDictationStatus('API key not found. Please check environment variables.');
      return null;
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const headers = { 'Content-Type': 'application/json' };
    
    let payload = {
        contents: [{ parts: [{ text: prompt }] }],
    };

    if (inlineData) {
        payload.contents[0].parts.push({
            inlineData: { mimeType, data: inlineData }
        });
    }

    if (responseSchema) {
        payload.generationConfig = { responseMimeType: "application/json", responseSchema };
    }

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        return result?.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch (err) {
        console.error("Error calling Gemini API:", err);
        return null;
    }
  };

  const recalculateDealScore = async (data) => {
    if (data.stage === 'Closed Won') return 100;
    if (data.stage === 'Closed Lost') return 0;
    
    const allNotes = data.notes.map(note => ({
      text: note.text,
      sentiment: note.sentiment
    }));

    const prompt = `Based on the following account details, chronological notes, and its current position in the sales funnel, provide a predictive lead score from 0 to 100. A score of 100 indicates a very high probability of closing.

    Consider these primary factors:
    1. The deal's progression through the sales funnel. This is the most important indicator.
    2. The combined sentiment of the notes, and the trend of that sentiment over time. Recent positive sentiment is more important than old negative sentiment.
    3. The deal's value and other details including the setup fee and monthly subscription.

    Account Details:
    Current Stage: ${data.stage}
    Deal Value: $${data.value}
    Monthly Value: $${data.monthlyValue}
    Company Name: ${data.companyName}

    Chronological History (Notes):
    ${JSON.stringify(allNotes, null, 2)}
    
    Return only the integer score as a number.`;
    
    const scoreText = await callGeminiAPI(prompt, 'text/plain', null, { type: "NUMBER" });
    return scoreText ? parseFloat(scoreText) : 50;
  };

  const handleDraftEmail = async () => {
    setLoadingAI(true);
    setDictationStatus('Drafting email...');

    const notesSummary = formData.notes.length > 0
      ? formData.notes.map(note => note.text).join('\n')
      : 'No notes available. The last interaction was for ' + formData.stage;

    const prompt = `You are a professional sales representative. Draft a concise and personalized follow-up email for a client. The email should be polite, reference the previous interactions, and suggest a clear next step.

    Account Details:
    Company Name: ${formData.companyName}
    Services Needed: ${formData.servicesNeeded}
    Current Stage: ${formData.stage}
    Primary Contact: ${formData.contactName}
    Notes from previous interactions:
    ${notesSummary}

    Draft the email, starting with a subject line. Do not include a signature.`;

    const draft = await callGeminiAPI(prompt);
    if (draft) {
      setEmailDraft(draft);
    } else {
      setEmailDraft("Failed to generate email draft. Please try again.");
    }
    setLoadingAI(false);
    setDictationStatus('');
  };

  const handleGenerateAgenda = async () => {
    setLoadingAI(true);
    setDictationStatus('Generating agenda...');

    const notesSummary = formData.notes.length > 0
      ? formData.notes.map(note => note.text).join('\n')
      : 'No notes available.';
    
    const prompt = `You are a professional sales manager. Generate a concise and scannable meeting agenda for the next sales call. The agenda should be based on the account details and historical notes.

    Format the response with markdown. Use a single heading, followed by bullet points for each section. Keep each section to a maximum of 3-4 bullet points.

    ## Meeting Agenda: ${formData.companyName} - ${formData.servicesNeeded}

    **Objective**
    - [Briefly state the goal of the meeting based on the current stage.]

    **Key Discussion Points**
    - [Key topics pulled from notes or next steps in the sales funnel.]
    - [Address any customer concerns mentioned in the notes.]
    - [Review of the last interaction.]

    **Next Steps**
    - [Actionable tasks or commitments to close the deal.]

    Account Details:
    Current Stage: ${formData.stage}
    Notes from previous interactions:
    ${notesSummary}
    
    Draft the agenda using the structure and content above. Do not include any other text.`;

    const generatedAgenda = await callGeminiAPI(prompt);
    if (generatedAgenda) {
      setAgenda(marked.parse(generatedAgenda));
    } else {
      setAgenda("Failed to generate meeting agenda. Please try again.");
    }
    setLoadingAI(false);
    setDictationStatus('');
  };

  const handleScanBusinessCard = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoadingAI(true);
    setDictationStatus('Scanning card...');
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result.split(',')[1];
      const prompt = "Extract the following information from this business card and return it as a JSON object with keys: companyName, contactName, contactTitle, contactEmail, contactPhone. Only return the JSON object, nothing else.";
      const jsonText = await callGeminiAPI(prompt, file.type, base64Data);

      if (jsonText) {
        const parsedData = JSON.parse(jsonText.replace(/```json\n|\n```/g, ''));
        setFormData(prev => ({
          ...prev,
          ...parsedData,
          contactName: parsedData.contactName || '',
          contactEmail: parsedData.contactEmail || '',
          contactPhone: parsedData.contactPhone || '',
          contactTitle: parsedData.contactTitle || '',
          companyName: parsedData.companyName || ''
        }));
      } else {
        console.error("AI extraction failed: No text in response.");
      }
      setLoadingAI(false);
      setDictationStatus('');
    };
    reader.readAsDataURL(file);
  };

  const handleDictate = async () => {
    if (!('webkitSpeechRecognition' in window)) {
      console.error("Speech recognition not supported in this browser.");
      return;
    }
    const SpeechRecognition = window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'en-US';

    let finalTranscript = '';

    recognitionRef.current.onstart = () => {
      setLoadingAI(true);
      setDictationStatus('Listening...');
      setLiveTranscript('');
      finalTranscript = '';
    };
    recognitionRef.current.onresult = (event) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      setLiveTranscript(finalTranscript + interimTranscript);
    };
    recognitionRef.current.onend = async () => {
      recognitionRef.current = null;
      if (finalTranscript.trim() === '') {
        setLoadingAI(false);
        setDictationStatus('');
        console.warn("Speech recognition ended with no final transcript.");
        return;
      }
      setDictationStatus('Thinking...');
      const prompt = `Based on the following transcript, extract key information and return a JSON object with keys for companyName, servicesNeeded, value (as a number), monthlyValue (as a number), contactName, contactTitle, contactEmail, and contactPhone. If a value is not found, use a null. Do not include any other text besides the JSON. Transcript: "${finalTranscript.trim()}"`;
      const jsonText = await callGeminiAPI(prompt, 'text/plain', null, {
        type: "OBJECT",
        properties: {
            "companyName": { "type": "STRING" },
            "servicesNeeded": { "type": "STRING" },
            "value": { "type": "NUMBER" },
            "monthlyValue": { "type": "NUMBER" },
            "contactName": { "type": "STRING" },
            "contactTitle": { "type": "STRING" },
            "contactEmail": { "type": "STRING" },
            "contactPhone": { "type": "STRING" }
        }
      });

      if (jsonText) {
        const parsedData = JSON.parse(jsonText);
        setFormData(prev => ({
          ...prev,
          ...parsedData,
          value: parsedData.value || '',
          monthlyValue: parsedData.monthlyValue || '',
        }));
      } else {
        console.error("AI parsing failed: No text in response.");
      }
      setLoadingAI(false);
      setDictationStatus('');
    };
    recognitionRef.current.onerror = (event) => {
      if (event.error === 'no-speech') {
        console.warn("Speech recognition stopped due to no speech detected.");
      } else {
        console.error("Speech recognition error:", event.error);
      }
      setDictationStatus('');
      setLoadingAI(false);
    };
    recognitionRef.current.start();
  };

  const handleStopDictate = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const handleNoteDictate = () => {
      if (!('webkitSpeechRecognition' in window)) {
        console.error("Speech recognition not supported in this browser.");
        return;
      }
      const SpeechRecognition = window.webkitSpeechRecognition;
      noteRecognitionRef.current = new SpeechRecognition();
      noteRecognitionRef.current.continuous = true;
      noteRecognitionRef.current.interimResults = true;
      noteRecognitionRef.current.lang = 'en-US';

      let finalTranscript = '';
      setIsDictatingNotes(true);
      setNewNote('');
      setLiveTranscript('');
      setDictationStatus('Listening...');

      noteRecognitionRef.current.onresult = (event) => {
          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                  finalTranscript += event.results[i][0].transcript;
              } else {
                  interimTranscript += event.results[i][0].transcript;
              }
          }
          setLiveTranscript(finalTranscript + interimTranscript);
      };

      noteRecognitionRef.current.onend = async () => {
          setIsDictatingNotes(false);
          noteRecognitionRef.current = null;
          if (finalTranscript.trim() === '') {
              setNewNote('');
              setIsNoteProcessing(false);
              setDictationStatus('');
              console.warn("Speech recognition ended with no final transcript.");
              return;
          }
          setDictationStatus('Processing...');
          const transcript = finalTranscript.trim();
          
          const prompt = `Analyze the following transcript of a sales call or meeting. Extract and structure the information into three categories: 'summary' (as bullet points), 'actions' (as a list of tasks that need to be done), and 'concerns' (customer issues or questions). Also, classify the overall sentiment of the conversation as 'Positive', 'Negative', or 'Neutral'. Return the result as a JSON object with the keys 'summary', 'actions', 'concerns', and 'sentiment'. If a category has no information, use an empty array. Do not include any text outside of the JSON object.
          Transcript: "${transcript}"`;
          const jsonText = await callGeminiAPI(prompt, 'text/plain', null, {
              type: "OBJECT",
              properties: {
                  "summary": { "type": "ARRAY", "items": { "type": "STRING" } },
                  "actions": { "type": "ARRAY", "items": { "type": "STRING" } },
                  "concerns": { "type": "ARRAY", "items": { "type": "STRING" } },
                  "sentiment": { "type": "STRING" }
              }
          });

          if (jsonText) {
              const parsedData = JSON.parse(jsonText);
              let formattedNote = '';
              const sentimentEmoji = parsedData.sentiment === 'Positive' ? '😊' : parsedData.sentiment === 'Negative' ? '😞' : '😐';

              formattedNote += `**Sentiment:** ${parsedData.sentiment} ${sentimentEmoji}\n\n`;
              if (parsedData.summary.length > 0) {
                  formattedNote += "**Summary:**\n" + parsedData.summary.map(item => `• ${item}`).join("\n");
              }
              if (parsedData.actions.length > 0) {
                  formattedNote += (formattedNote ? "\n\n" : "") + "**Action Items:**\n" + parsedData.actions.map(item => `• ${item}`).join("\n");
              }
              if (parsedData.concerns.length > 0) {
                  formattedNote += (formattedNote ? "\n\n" : "") + "**Customer Concerns:**\n" + parsedData.concerns.map(item => `• ${item}`).join("\n");
              }
              setNewNote(formattedNote);
          } else {
            setNewNote('Failed to process note.');
          }
          setIsNoteProcessing(false);
          setDictationStatus('');
          setLiveTranscript('');
      };

      noteRecognitionRef.current.onerror = (event) => {
          if (event.error === 'no-speech') {
            console.warn("Speech recognition for notes stopped due to no speech detected.");
          } else {
            console.error("Speech recognition error:", event.error);
          }
          setIsDictatingNotes(false);
          setIsNoteProcessing(false);
          setDictationStatus('');
          setNewNote('');
          setLiveTranscript('');
      };
      noteRecognitionRef.current.start();
  };

  const handleStopNoteDictate = () => {
    if (noteRecognitionRef.current) {
      noteRecognitionRef.current.stop();
    }
  };

  const handleEditNote = (index, newNoteContent) => {
    const updatedNotes = [...formData.notes];
    updatedNotes[index] = { ...updatedNotes[index], text: newNoteContent };
    setFormData(prev => ({ ...prev, notes: updatedNotes }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddNote = async () => {
    if (newNote.trim() === '' || !account) return;
    
    // Save note to Firestore
    const updatedNotes = [...formData.notes, { text: newNote, timestamp: new Date().toISOString() }];
    const docRef = doc(db, `artifacts/${appId}/users/${user.uid}/accounts`, account.id);
    await updateDoc(docRef, { notes: updatedNotes });

    setFormData(prev => ({ ...prev, notes: updatedNotes }));
    setNewNote('');
  };

  const handleSave = async (e) => {
      e.preventDefault();
      setIsAddingAccount(true);
      const updatedFormData = { ...formData };
      if (updatedFormData.stage === 'Business Intel' && !updatedFormData.servicesNeeded) {
        updatedFormData.servicesNeeded = 'N/A';
      }
      try {
        const newDealScore = await recalculateDealScore(updatedFormData);
        updatedFormData.dealScore = newDealScore;
        await onSave(updatedFormData);
      } finally {
        setIsAddingAccount(false);
      }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="flex items-center space-x-4 mb-4">
        <label className={`relative flex items-center px-4 py-2 rounded-full cursor-pointer transition-colors ${loadingAI ? 'bg-gray-400 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
          <input type="file" accept="image/*" onChange={handleScanBusinessCard} className="absolute inset-0 opacity-0 cursor-pointer" disabled={loadingAI} />
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
          </svg>
          Scan Business Card
        </label>
        {!recognitionRef.current ? (
          <button type="button" onClick={handleDictate} className={`flex items-center px-4 py-2 rounded-full transition-colors ${loadingAI ? 'bg-gray-400 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`} disabled={loadingAI}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H2V5z" />
            </svg>
            Dictate
          </button>
        ) : (
          <button type="button" onClick={handleStopDictate} className="flex items-center px-4 py-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 animate-pulse" viewBox="0 0 20 20" fill="currentColor">
              <circle cx="10" cy="10" r="8" />
            </svg>
            Stop
          </button>
        )}
      </div>

      {dictationStatus && <div className="text-blue-600 text-sm font-semibold mb-4">{dictationStatus}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Company Name</label>
          <input type="text" name="companyName" value={formData.companyName} onChange={handleChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Services Needed</label>
          <input type="text" name="servicesNeeded" value={formData.servicesNeeded} onChange={handleChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Deal Value ($)</label>
          <input type="number" name="value" value={formData.value} onChange={handleChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Monthly Value ($)</label>
          <input type="number" name="monthlyValue" value={formData.monthlyValue} onChange={handleChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Expected Close Date</label>
          <input type="date" name="expectedCloseDate" value={formData.expectedCloseDate} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Next Follow-up Date</label>
          <input type="date" name="nextFollowUpDate" value={formData.nextFollowUpDate} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Primary Contact</label>
          <input type="text" name="contactName" value={formData.contactName} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Contact Title</label>
          <input type="text" name="contactTitle" value={formData.contactTitle} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Contact Email</label>
          <input type="email" name="contactEmail" value={formData.contactEmail} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Contact Phone</label>
          <input type="tel" name="contactPhone" value={formData.contactPhone} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Industry</label>
          <input type="text" name="industry" value={formData.industry} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Lead Source</label>
          <input type="text" name="leadSource" value={formData.leadSource} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
        </div>
        {formData.stage === 'Closed Lost' && (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Reason for Losing</label>
            <textarea name="lostReason" value={formData.lostReason} onChange={handleChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" rows="3"></textarea>
          </div>
        )}
      </div>

      {account && (
        <div className="mt-6">
          <button
            type="button"
            onClick={handleDraftEmail}
            className="flex items-center justify-center w-full bg-indigo-600 text-white px-4 py-2 rounded-full shadow-md hover:bg-indigo-700 transition duration-300 ease-in-out"
            disabled={loadingAI}
          >
            ✨ AI Draft Email
          </button>
          {emailDraft && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="text-sm font-semibold mb-2">Email Draft:</h4>
              <textarea
                value={emailDraft}
                readOnly
                className="w-full text-sm text-gray-800 bg-transparent border-none focus:outline-none"
                rows="10"
              ></textarea>
              <button
                type="button"
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(emailDraft);
                  } catch (e) {
                    const tempInput = document.createElement('textarea');
                    tempInput.value = emailDraft;
                    document.body.appendChild(tempInput);
                    tempInput.select();
                    document.execCommand('copy');
                    document.body.removeChild(tempInput);
                  }
                }}
                className="mt-2 text-xs text-blue-600 hover:underline"
              >
                Copy to Clipboard
              </button>
            </div>
          )}
        </div>
      )}

      {account && (
        <div className="mt-6">
          <button
            type="button"
            onClick={handleGenerateAgenda}
            className="flex items-center justify-center w-full bg-teal-600 text-white px-4 py-2 rounded-full shadow-md hover:bg-teal-700 transition duration-300 ease-in-out"
            disabled={loadingAI}
          >
            ✨ AI Generate Agenda
          </button>
          {agenda && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="text-sm font-semibold mb-2">Meeting Agenda:</h4>
              <div
                className="prose prose-sm w-full max-w-none text-sm text-gray-800 bg-transparent border-none focus:outline-none"
                dangerouslySetInnerHTML={{ __html: agenda }}
              ></div>
              <button
                type="button"
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(agenda);
                  } catch (e) {
                    const tempInput = document.createElement('textarea');
                    tempInput.value = agenda;
                    document.body.appendChild(tempInput);
                    tempInput.select();
                    document.execCommand('copy');
                    document.body.removeChild(tempInput);
                  }
                }}
                className="mt-2 text-xs text-blue-600 hover:underline"
              >
                Copy to Clipboard
              </button>
            </div>
          )}
        </div>
      )}

      {account && (
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700">Activity & Notes</label>
          <div className="border border-gray-300 rounded-md p-3 max-h-48 overflow-y-auto mt-1">
            {formData.notes.map((note, index) => (
              <div key={index} className="text-sm text-gray-700 mb-2 p-2 bg-gray-50 rounded-md group relative">
                <p>{note.text}</p>
                <p className="text-xs text-gray-400 mt-1">{new Date(note.timestamp).toLocaleString()} | <span className={`font-semibold ${note.sentiment === 'Positive' ? 'text-green-600' : note.sentiment === 'Negative' ? 'text-red-600' : 'text-gray-600'}`}>{note.sentiment}</span></p>
              </div>
            ))}
          </div>
          <div className="flex items-center mt-2">
            <textarea
              value={isDictatingNotes ? liveTranscript : newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder={isDictatingNotes ? 'Speaking...' : (isNoteProcessing ? 'Processing...' : 'Add a new note...')}
              className="flex-grow rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
              disabled={isNoteProcessing}
              rows={isDictatingNotes ? 4 : 1}
            />
            {!isDictatingNotes ? (
              <button
                type="button"
                onClick={handleNoteDictate}
                className={`ml-2 flex items-center px-4 py-2 rounded-full transition-colors ${loadingAI ? 'bg-gray-400 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                disabled={loadingAI}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7 4a3 3 0 00-3 3v6a3 3 0 003 3h6a3 3 0 003-3V7a3 3 0 00-3-3H7zm0 2a1 1 0 00-1 1v6a1 1 0 001 1h6a1 1 0 001-1V7a1 1 0 00-1-1H7z" clipRule="evenodd" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopNoteDictate}
                className="ml-2 flex items-center px-4 py-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 animate-pulse" viewBox="0 0 20 20" fill="currentColor">
                  <circle cx="10" cy="10" r="8" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={handleAddNote}
              className="ml-2 bg-blue-600 text-white px-4 py-2 rounded-full shadow-md hover:bg-blue-700 transition duration-300 ease-in-out"
              disabled={isNoteProcessing || isDictatingNotes}
            >
              Add Note
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-end space-x-2 mt-6">
        {onDelete && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="bg-red-600 text-white px-6 py-3 rounded-full shadow-md hover:bg-red-700 transition duration-300 ease-in-out"
          >
            Delete
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="bg-gray-300 text-gray-800 px-6 py-3 rounded-full shadow-md hover:bg-gray-400 transition duration-300 ease-in-out"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="bg-green-600 text-white px-6 py-3 rounded-full shadow-md hover:bg-green-700 transition duration-300 ease-in-out"
          disabled={isAddingAccount}
        >
          {isAddingAccount ? (
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            account ? 'Save Changes' : 'Add Account'
          )}
        </button>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 relative">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Confirm Deletion</h3>
            <p className="text-gray-600 mb-6">Are you sure you want to delete this account? This action cannot be undone.</p>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="bg-gray-300 text-gray-800 px-4 py-2 rounded-full hover:bg-gray-400 transition duration-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(account.id);
                  setShowDeleteConfirm(false);
                }}
                className="bg-red-600 text-white px-4 py-2 rounded-full hover:bg-red-700 transition duration-300"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
};

export default App;
