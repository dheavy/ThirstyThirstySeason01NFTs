import { expect, use } from 'chai'
import { ethers } from 'hardhat'
import { Contract, BigNumber, BigNumberish } from 'ethers'
import { generateMerkleTree, getMerkleRoot } from '../utils/goldlist'
import keccak256 from 'keccak256'
import asPromised from 'chai-as-promised'
import { openSeaProxyRegistryAddress } from '../utils/constants'

use(asPromised)

const priceCellar = ethers.utils.parseEther('0.4')
const priceTable = ethers.utils.parseEther('0.2')
const priceTableGold = ethers.utils.parseEther('0.1')

const tierCellarId = 1
const tierTableId = 2
const tierTableGoldId = 3
const tierFriendsId = 4

const tierCellar = { id: tierCellarId, minted: 0, supply: 270, priceInWei: priceCellar }
const tierTable = { id: tierTableId, minted: 0, supply: 518, priceInWei: priceTable }
const tierTableGold = { id: tierTableGoldId, minted: 0, supply: 100, priceInWei: priceTableGold }
const tierFriends = { id: tierFriendsId, minted: 0, supply: 50, priceInWei: BigNumber.from(0) }

interface Tier {
  id: BigNumberish
  minted: BigNumberish
  supply: BigNumberish
  priceInWei: BigNumber
}

const createAndDeploy = async (
  name: string = 'Thirsty Thirsty',
  symbol: string = 'TT',
  baseURI: string = 'https://tt.dev/',
  isMintStarted: boolean = true,
  merkleRoot: BigNumberish = ethers.utils.hexZeroPad('0x00', 32),
  tier1: Tier = tierCellar,
  tier2: Tier = tierTable,
  tier3: Tier = tierTableGold,
  tier4: Tier = tierFriends
): Promise<Contract> => {
  const Factory = await ethers.getContractFactory('ThirstyThirstySeason01')
  const contract = await Factory.deploy(
    name,
    symbol,
    baseURI,
    isMintStarted,
    openSeaProxyRegistryAddress,
    tier1,
    tier2,
    tier3,
    tier4,
    merkleRoot
  )
  await contract.deployed()
  return contract
}

describe('ThirstyThirstySeason01', () => {
  let contract: Contract
  const baseURI = 'https://tt.dev/'

  beforeEach(async () => {
    contract = await createAndDeploy()
  })

  describe('deployment', () => {
    it('should be deployable', async () => {
      expect(contract).to.exist
    })

    it('should increment token ID counter to 1 upon deployment', async () => {
      await expect(contract.nextTokenID()).to.eventually.equal('1')
    })
  })

  describe('getters', () => {
    it('should return the current token ID with #nextTokenID', async () => {
      await expect(contract.nextTokenID()).to.eventually.equal('1')
    })

    it('should return the number of minted items with #totalMinted', async () => {
      await expect(contract.totalMinted()).to.eventually.equal('0')
      await contract.mint(tierCellarId, { value: priceCellar })
      await expect(contract.totalMinted()).to.eventually.equal('1')
    })

    it("should fail if trying to call #tokenURI on non-existent token", async () => {
      await expect(contract.tokenURI('1'))
        .to.be.eventually.rejectedWith('URI query for nonexistent token')
    })

    it("should return an existing token's full URI with #tokenURI", async () => {
      await contract.mint(tierCellarId, { value: priceCellar })
      await expect(contract.tokenURI('1')).to.eventually.equal(`${baseURI}1`)
    })
  })

  describe('#setMerkleRoot', () => {
    it('should update Merkle root value using #setMerkleRoot', async () => {
      let value = await contract.merkleRoot()
      expect(+value).to.equal(0)

      value = '0x81cd02ab7e569e8bcd9317e2fe99f2de44d49ab2b8851ba4a308000000000000'
      await contract.setMerkleRoot(value)
      await expect(contract.merkleRoot()).to.eventually.equal(value)
    })

    it('prevents non-owner to #setMerkleRoot', async () => {
      const notOwner = (await ethers.getSigners())[1]
      await expect(contract.connect(notOwner).setMerkleRoot('0x81cd02ab7e569e8bcd9317e2fe99f2de44d49ab2b8851ba4a308000000000000'))
        .to.be.rejectedWith('Ownable: caller is not the owner')
    })
  })

  describe('#setMintStarted', () => {
    beforeEach(async () => {
      contract = await createAndDeploy(
        'Thirsty Thirsty',
        'TT',
        'https://tt.dev/',
        false // isMintStarted => false
      )
    })

    it('should update the `isMintStarted` value using #setMintStarted', async () => {
      let value = await contract.isMintStarted()
      expect(value).to.equal(false)
      await contract.setMintStarted(true)
      await expect(contract.isMintStarted()).to.eventually.equal(true)
    })

    it('prevents non-owner to #setMintStarted', async () => {
      const notOwner = (await ethers.getSigners())[1]
      await expect(contract.connect(notOwner).setMintStarted(true))
        .to.be.rejectedWith('Ownable: caller is not the owner')
    })
  })

  describe('#pause / #unpause', () => {
    it('should pause and unpause contract when owner asks for it', async () => {
      await expect(contract.paused()).to.eventually.equal(false)
      await contract.pause()
      await expect(contract.paused()).to.eventually.equal(true)
      await contract.unpause()
      await expect(contract.paused()).to.eventually.equal(false)
    })

    it('prevents non-owner to use pause functionality', async () => {
      const notOwner = (await ethers.getSigners())[1]
      await expect(contract.connect(notOwner).pause())
        .to.be.eventually.rejectedWith('Ownable: caller is not the owner')
      await expect(contract.connect(notOwner).unpause())
        .to.be.eventually.rejectedWith('Ownable: caller is not the owner')
    })
  })

  describe('#setProxyRegistryAddress', () => {
    it('prevents non-owner to use #setProxyRegistryAddress', async () => {
      const notOwner = (await ethers.getSigners())[1]
      await expect(contract.connect(notOwner).setProxyRegistryAddress(openSeaProxyRegistryAddress))
        .to.be.eventually.rejectedWith('Ownable: caller is not the owner')
    })

    it('updates proxyRegistryAddress with #setProxyRegistryAddress', async () => {
      const addr = (await contract.proxyRegistryAddress()).toLowerCase()
      const newAddr = '0xa5409ec958c83c3f309868babaca7c86dcb077c1'
      expect(addr).to.equal(openSeaProxyRegistryAddress.toLowerCase())
      await expect(contract.setProxyRegistryAddress(newAddr))
        .not.to.be.rejected
      const updatedAddr = (await contract.proxyRegistryAddress()).toLowerCase()
      expect(updatedAddr).to.equal(newAddr)
    })
  })

  describe('#mint', () => {
    it('should fail if #isMintStarted is false', async () => {
      contract = await createAndDeploy('ThirstyThirsty', 'TT', baseURI, false)
      await expect(contract.isMintStarted()).to.eventually.be.false

      await expect(contract.mint(tierCellarId, { value: priceCellar }))
        .to.be.eventually.rejectedWith('Not yet started')
    })

    it('should fail minting if not enough fund sent', async () => {
      await expect(contract.mint(tierCellarId, { value: ethers.utils.parseEther('0.1') }))
        .to.be.eventually.rejectedWith('Not enough fund')
    })

    it('should fail minting if address all available tokens have been minted', async () => {
      contract = await createAndDeploy(
        'ThirstyThirsty', 'TT', baseURI, true,
        ethers.utils.hexZeroPad('0x00', 32),
        { ...tierCellar, supply: 0 }
      )

      await expect(contract.mint(tierCellarId, { value: priceCellar }))
        .to.be.eventually.rejectedWith('Sold out')
    })

    it('should fail if user attempts to mint more than 6 tokens', async () => {
      contract = await createAndDeploy()

      await expect(contract.mint(tierCellarId, { value: priceCellar }))
        .to.not.be.eventually.rejected
      await expect(contract.mint(tierCellarId, { value: priceCellar }))
        .to.not.be.eventually.rejected
      await expect(contract.mint(tierCellarId, { value: priceCellar }))
        .to.not.be.eventually.rejected
      await expect(contract.mint(tierCellarId, { value: priceCellar }))
        .to.not.be.eventually.rejected
      await expect(contract.mint(tierCellarId, { value: priceCellar }))
        .to.not.be.eventually.rejected
      await expect(contract.mint(tierCellarId, { value: priceCellar }))
        .to.not.be.eventually.rejected
      await expect(contract.mint(tierCellarId, { value: priceCellar }))
        .to.be.eventually.rejectedWith('No more mint for user')
    })

    it('should mint a new token and increment next token ID', async () => {
      await expect(contract.mint(tierCellarId, { value: priceCellar }))
        .to.not.be.eventually.rejected
      await expect(contract.totalMinted()).to.eventually.equal('1')
      await expect(contract.nextTokenID()).to.eventually.equal('2')
    })
  })

  describe('#mintGold', () => {
    it('should mint from goldlist only if signer is in goldlist, then increment next token ID', async () => {
      const users = await ethers.getSigners()
      const whitelistAddresses = [
        users[1].address,
        users[2].address,
        users[5].address
      ]
      const merkleTree = generateMerkleTree(whitelistAddresses)
      const merkleRoot = getMerkleRoot(merkleTree)

      contract = await createAndDeploy(
        'ThirstyThirsty', 'TT', baseURI, true, merkleRoot
      )

      await expect(
        contract
          .connect(users[1])
          .mintGold(
            merkleTree.getHexProof(keccak256(users[1].address)),
            { value: priceTableGold }
          )
      ).to.not.be.eventually.rejected

      await expect(contract.totalMinted()).to.eventually.equal('1')
      await expect(contract.nextTokenID()).to.eventually.equal('2')

      await expect(
        contract
          .connect(users[2])
          .mintGold(
            merkleTree.getHexProof(keccak256(users[2].address)),
            { value: priceTableGold }
          )
      ).to.not.be.eventually.rejected

      await expect(
        contract
          .connect(users[5])
          .mintGold(
            merkleTree.getHexProof(keccak256(users[5].address)),
            { value: priceTableGold }
          )
      ).to.not.be.eventually.rejected

      await expect(
        contract
          .connect(users[4])
          .mintGold(
            merkleTree.getHexProof(keccak256(users[4].address)),
            { value: priceTableGold }
          )
      ).to.be.eventually.rejectedWith('Address not in goldlist')
    })

    it('should fail if user attempts to mint more than 6 tokens', async () => {
      const users = await ethers.getSigners()
      const whitelistAddresses = [
        users[1].address,
        users[2].address,
        users[5].address
      ]
      const merkleTree = generateMerkleTree(whitelistAddresses)
      const merkleRoot = getMerkleRoot(merkleTree)

      contract = await createAndDeploy(
        'ThirstyThirsty', 'TT', baseURI, true, merkleRoot
      )

      await expect(
        contract
          .connect(users[5])
          .mint(tierCellarId, { value: priceCellar })
        ).to.not.be.eventually.rejected
      await expect(
        contract
          .connect(users[5])
          .mint(tierCellarId, { value: priceCellar })
        ).to.not.be.eventually.rejected
      await expect(
        contract
          .connect(users[5])
          .mint(tierCellarId, { value: priceCellar })
        ).to.not.be.eventually.rejected
      await expect(
        contract
          .connect(users[5])
          .mint(tierCellarId, { value: priceCellar })
        ).to.not.be.eventually.rejected
      await expect(
        contract
          .connect(users[5])
          .mint(tierCellarId, { value: priceCellar })
        ).to.not.be.eventually.rejected
      await expect(
        contract
          .connect(users[5])
          .mint(tierCellarId, { value: priceCellar })
        ).to.not.be.eventually.rejected

      await expect(
        contract
          .connect(users[5])
          .mintGold(
            merkleTree.getHexProof(keccak256(users[5].address)),
            { value: priceTableGold }
          )
      ).to.be.eventually.rejectedWith('No more mint for user')
    })

    it('should fail minting if address has already minted', async () => {
      const user = (await ethers.getSigners())[0]
      const merkleTree = generateMerkleTree([user.address])
      const merkleRoot = getMerkleRoot(merkleTree)

      contract = await createAndDeploy(
        'ThirstyThirsty', 'TT', baseURI, true, merkleRoot
      )

      await expect(
        contract
          .mintGold(
            merkleTree.getHexProof(keccak256(user.address)),
            { value: priceTableGold }
          )
      ).not.to.be.eventually.rejected

      await expect(
        contract
          .mintGold(
            merkleTree.getHexProof(keccak256(user.address)),
            { value: priceTableGold }
          )
      ).to.be.eventually.rejectedWith('Address has already claimed')
    })

    it('should fail minting if address all available tokens have been minted', async () => {
      const user = (await ethers.getSigners())[0]
      const merkleTree = generateMerkleTree([user.address])
      const merkleRoot = getMerkleRoot(merkleTree)

      contract = await createAndDeploy(
        'ThirstyThirsty', 'TT', baseURI,
        true, merkleRoot, tierCellar, tierTable,
        { ...tierTableGold, supply: 0 }
      )

      await expect(
        contract
          .mintGold(
            merkleTree.getHexProof(keccak256(user.address)),
            { value: priceTableGold }
          )
      ).to.be.eventually.rejectedWith('Sold out')
    })

    it('should fail minting if not enough fund sent', async () => {
      const user = (await ethers.getSigners())[0]
      const merkleTree = generateMerkleTree([user.address])
      const merkleRoot = getMerkleRoot(merkleTree)

      contract = await createAndDeploy(
        'ThirstyThirsty', 'TT', baseURI, true, merkleRoot
      )

      await expect(
          contract
            .mintGold(
              merkleTree.getHexProof(keccak256(user.address)),
              { value: ethers.utils.parseEther('0.01') }
            )
        ).to.be.eventually.rejectedWith('Not enough fund')
    })
  })

  describe('#airdrop', () => {
    beforeEach(async () => {
      contract = await createAndDeploy()
    })

    it('prevents non-owner to use #airdrop', async () => {
      const notOwner = (await ethers.getSigners())[1]
      await expect(contract.connect(notOwner).airdrop('0x70997970c51812dc3a010c7d01b50e0d17dc79c8'))
        .to.be.rejectedWith('Ownable: caller is not the owner')
    })

    it('should revert if recipient wallet already owns 6 tokens', async () => {
      const recipient = (await ethers.getSigners())[1]
      await expect(contract.connect(recipient).mint(tierCellarId, { value: priceCellar }))
        .to.not.be.eventually.rejected
      await expect(contract.connect(recipient).mint(tierCellarId, { value: priceCellar }))
        .to.not.be.eventually.rejected
      await expect(contract.connect(recipient).mint(tierCellarId, { value: priceCellar }))
        .to.not.be.eventually.rejected
      await expect(contract.connect(recipient).mint(tierCellarId, { value: priceCellar }))
        .to.not.be.eventually.rejected
      await expect(contract.connect(recipient).mint(tierCellarId, { value: priceCellar }))
        .to.not.be.eventually.rejected
      await expect(contract.connect(recipient).mint(tierCellarId, { value: priceCellar }))
        .to.not.be.eventually.rejected

      await expect(contract.airdrop(recipient.address))
        .to.be.eventually.rejectedWith('No more mint for user')
    })

    it('should fail minting if address all available tokens have been minted', async () => {
      const recipient = (await ethers.getSigners())[1]

      contract = await createAndDeploy(
        'ThirstyThirsty', 'TT', baseURI, true,
        ethers.utils.hexZeroPad('0x00', 32),
        tierCellar, tierTable, tierTableGold,
        { ...tierFriends, supply: 0 }
      )

      await expect(contract.airdrop(recipient.address))
        .to.be.eventually.rejectedWith('Sold out')
    })

    it('should mint a token to recipient wallet passed as argument', async () => {
      const recipient = (await ethers.getSigners())[1]
      await expect(contract.balanceOf(recipient.address)).to.be.eventually.equal('0')

      await expect(contract.airdrop(recipient.address))
      await expect(contract.balanceOf(recipient.address)).to.be.eventually.equal('1')
    })
  })
})
