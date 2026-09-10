// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GachardCard
 * @notice ERC-1155 token untuk kartu Gachard dengan state machine Digital/Vaulted
 * @dev ADR-001: ERC-1155 (one-token-per-instance, bukan fungible balance)
 * @dev ADR-004: Lock & Transfer ke Vault bukan Burn
 * @dev ADR-007: recipientAddress/ownerAddress eksplisit, bukan msg.sender
 */
contract GachardCard is ERC1155, Ownable {
    enum CardStatus { Digital, Vaulted }
    enum Rarity { Common, Rare, Epic, Legendary }

    uint256 public nextTokenId = 1;

    mapping(uint256 => CardStatus) public cardStatus;
    mapping(uint256 => Rarity) public cardRarity;
    mapping(uint256 => bytes32) public storedHash;
    mapping(uint256 => address) public lastOwner;
    mapping(uint256 => uint8) public lastRiskScore;
    mapping(uint256 => bool) public flaggedSuspicious;
    mapping(address => bool) public authorizedMinters;

    event CardMinted(uint256 indexed tokenId, address indexed to, CardStatus status, Rarity rarity);
    event CardStatusChanged(uint256 indexed tokenId, CardStatus oldStatus, CardStatus newStatus);
    event MarketplaceTransfer(uint256 indexed tokenId, address indexed from, address indexed to);
    event VerificationRecorded(uint256 indexed tokenId, uint8 riskScore, bool flagged);
    event CardBurned(uint256 indexed tokenId, address indexed owner, uint8 rarity);
    event AuthorizedMinterUpdated(address indexed minter, bool authorized);

    constructor() ERC1155("") Ownable(msg.sender) {}

    modifier onlyOwnerOrAuthorized() {
        require(msg.sender == owner() || authorizedMinters[msg.sender], "Not authorized");
        _;
    }

    /**
     * @notice Tambah/hapus authorized minter (misal PackEntropy contract)
     */
    function setAuthorizedMinter(address minter, bool authorized) external onlyOwner {
        authorizedMinters[minter] = authorized;
        emit AuthorizedMinterUpdated(minter, authorized);
    }

    /**
     * @notice Mint kartu baru dengan status default Digital dan rarity tertentu
     * @param to Alamat penerima kartu
     * @param rarity Rarity kartu (0=Common, 1=Rare, 2=Epic, 3=Legendary)
     * @return tokenId ID kartu yang baru di-mint
     */
    function mintCard(address to, uint8 rarity) external onlyOwnerOrAuthorized returns (uint256 tokenId) {
        require(rarity <= 3, "Invalid rarity");
        tokenId = nextTokenId++;
        _mint(to, tokenId, 1, "");
        cardStatus[tokenId] = CardStatus.Digital;
        cardRarity[tokenId] = Rarity(rarity);
        lastOwner[tokenId] = to;
        emit CardMinted(tokenId, to, CardStatus.Digital, Rarity(rarity));
    }

    /**
     * @notice Mint batch kartu (untuk pack) — atomik, semua atau tidak sama sekali
     * @param to Alamat penerima kartu
     * @param rarities Array rarity per kartu (0=Common, 1=Rare, 2=Epic, 3=Legendary)
     * @return tokenIds Array ID kartu yang baru di-mint
     */
    function mintBatch(address to, uint8[] calldata rarities) external onlyOwnerOrAuthorized returns (uint256[] memory tokenIds) {
        uint256 count = rarities.length;
        require(count > 0, "Empty rarities array");

        tokenIds = new uint256[](count);
        uint256[] memory amounts = new uint256[](count);

        for (uint256 i = 0; i < count; i++) {
            require(rarities[i] <= 3, "Invalid rarity");
            uint256 tokenId = nextTokenId++;
            tokenIds[i] = tokenId;
            amounts[i] = 1;
            cardStatus[tokenId] = CardStatus.Digital;
            cardRarity[tokenId] = Rarity(rarities[i]);
            lastOwner[tokenId] = to;
        }

        _mintBatch(to, tokenIds, amounts, "");

        for (uint256 i = 0; i < count; i++) {
            emit CardMinted(tokenIds[i], to, CardStatus.Digital, Rarity(rarities[i]));
        }
    }

    /**
     * @notice Kunci kartu untuk cetak fisik — generate hash baru, overwrite hash lama
     * @dev onlyOwner — backend yang memanggil, bukan wallet user (ADR-007)
     * @dev Kartu TETAP di wallet user, hanya cardStatus berubah ke Vaulted.
     *      Proteksi dari _update() override yang blokir transfer selama Vaulted.
     * @param tokenId ID kartu yang akan di-print
     * @param redeemHash Hash dari redeem code yang baru (backend generate, kirim hash-nya saja)
     * @param ownerAddress Alamat pemilik kartu saat ini (untuk update lastOwner)
     */
    function requestPrint(uint256 tokenId, bytes32 redeemHash, address ownerAddress) external onlyOwner {
        require(cardStatus[tokenId] == CardStatus.Digital, "Card is not digital");
        require(ownerAddress != address(0), "Invalid owner address");
        require(balanceOf(ownerAddress, tokenId) == 1, "Owner does not hold card");

        // Simpan owner
        lastOwner[tokenId] = ownerAddress;

        // Overwrite hash lama (ADR-005)
        storedHash[tokenId] = redeemHash;

        // Ubah status ke Vaulted — kartu TETAP di wallet user
        // _update() override akan blokir transfer biasa selama Vaulted
        cardStatus[tokenId] = CardStatus.Vaulted;

        emit CardStatusChanged(tokenId, CardStatus.Digital, CardStatus.Vaulted);
    }

    /**
     * @notice Redeem kartu dari vault kembali ke digital
     * @dev Backend yang memanggil atas nama user (ADR-006, ADR-007)
     * @param tokenId ID kartu yang akan di-redeem
     * @param redeemHash Hash dari code yang dimasukkan user
     * @param recipientAddress Alamat yang akan menerima kartu (ADR-007)
     */
    function redeemCard(uint256 tokenId, bytes32 redeemHash, address recipientAddress) external onlyOwner {
        require(cardStatus[tokenId] == CardStatus.Vaulted, "Card is not vaulted");
        require(storedHash[tokenId] == redeemHash, "Invalid redeem code");

        // Simpan owner lama untuk transfer
        address previousOwner = lastOwner[tokenId];
        require(previousOwner != address(0), "Invalid previous owner");

        // Ubah status dulu, SEBELUM transfer — supaya _update() tidak memblokir
        cardStatus[tokenId] = CardStatus.Digital;

        // Update last owner
        lastOwner[tokenId] = recipientAddress;

        // Transfer dari owner lama ke recipient
        uint256[] memory ids = new uint256[](1);
        ids[0] = tokenId;
        uint256[] memory values = new uint256[](1);
        values[0] = 1;
        _update(previousOwner, recipientAddress, ids, values);

        emit CardStatusChanged(tokenId, CardStatus.Vaulted, CardStatus.Digital);
    }

    /**
     * @notice Transfer kartu antar user via marketplace — hanya untuk kartu Digital
     * @dev onlyOwner — backend yang memanggil (ADR-003, custodial model)
     * @param tokenId ID kartu yang ditransfer
     * @param from Alamat penjual (harus pemilik kartu saat ini)
     * @param to Alamat pembeli
     */
    function marketplaceTransfer(uint256 tokenId, address from, address to) external onlyOwner {
        require(cardStatus[tokenId] == CardStatus.Digital, "Card is not digital");
        require(balanceOf(from, tokenId) == 1, "Sender does not own card");

        uint256[] memory ids = new uint256[](1);
        ids[0] = tokenId;
        uint256[] memory values = new uint256[](1);
        values[0] = 1;
        _update(from, to, ids, values);

        lastOwner[tokenId] = to;

        emit MarketplaceTransfer(tokenId, from, to);
    }

    function recordVerification(uint256 tokenId, uint8 riskScore, bool flagged) external onlyOwner {
        require(riskScore <= 100, "Risk score out of range");
        lastRiskScore[tokenId] = riskScore;
        flaggedSuspicious[tokenId] = flagged;
        emit VerificationRecorded(tokenId, riskScore, flagged);
    }

    /**
     * @notice Burn kartu secara permanen — token dihancurkan, tidak bisa dipulihkan
     * @dev onlyOwner — backend yang memanggil (ADR-003, custodial model)
     * @dev Hanya kartu Digital yang bisa di-burn. _update() override sudah memblokir
     *      burn untuk kartu Vaulted karena _burn() memanggil _update(owner, address(0))
     *      dan from != address(0) akan trigger revert "Card is vaulted".
     * @param tokenId ID kartu yang akan di-burn
     * @param owner Alamat pemilik kartu saat ini
     */
    function burnCard(uint256 tokenId, address owner) external onlyOwner {
        require(cardStatus[tokenId] == CardStatus.Digital, "Card is not digital");
        require(balanceOf(owner, tokenId) == 1, "Owner does not hold card");

        Rarity rarity = cardRarity[tokenId];
        _burn(owner, tokenId, 1);

        emit CardBurned(tokenId, owner, uint8(rarity));
    }

    /**
     * @notice Override transfer untuk menolak transfer saat status Vaulted
     */
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override {
        for (uint256 i = 0; i < ids.length; i++) {
            if (cardStatus[ids[i]] == CardStatus.Vaulted && from != address(0)) {
                revert("Card is vaulted, transfer blocked");
            }
        }
        super._update(from, to, ids, values);

        // H-2 fix: update lastOwner on standard ERC1155 transfers
        for (uint256 i = 0; i < ids.length; i++) {
            if (from != address(0) && to != address(0)) {
                lastOwner[ids[i]] = to;
            }
        }
    }
}
