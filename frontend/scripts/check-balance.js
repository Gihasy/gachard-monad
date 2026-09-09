const { ethers } = require('ethers');

// Admin wallet address
const ADMIN_WALLET = process.env.ADMIN_WALLET_ADDRESS || '0x...';

// RPC URL
const RPC_URL = process.env.RPC_URL || 'https://testnet-rpc.monad.xyz';

async function main() {
  try {
    console.log('Checking balance for:', ADMIN_WALLET);
    console.log('RPC URL:', RPC_URL);
    
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    
    // Get balance
    const balance = await provider.getBalance(ADMIN_WALLET);
    const balanceInMON = ethers.formatEther(balance);
    
    console.log('Balance:', balanceInMON, 'MON');
    console.log('Balance (wei):', balance.toString());
    
    if (parseFloat(balanceInMON) > 0) {
      console.log('✅ Admin wallet has MON for gas fees');
    } else {
      console.log('❌ Admin wallet has NO MON - needs faucet');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
